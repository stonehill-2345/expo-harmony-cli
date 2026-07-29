/**
 * expo-av 鸿蒙适配层
 *
 * 业务代码 `import { Audio } from 'expo-av'` 在 harmony 平台通过 Metro resolveRequest
 * 重定向到本文件，内部用 @react-native-ohos/react-native-sound (harmony.alias: react-native-sound) 实现。
 *
 * 已实现的 API（覆盖 native / com-wpzm 两项目的实际使用）：
 * - Audio.Sound.createAsync / loadAsync / playAsync / pauseAsync / stopAsync
 * - setPositionAsync / getStatusAsync / setOnPlaybackStatusUpdate / unloadAsync
 * - Audio.setAudioModeAsync (no-op)
 * - AVPlaybackStatus 类型
 */

// ---------- 类型定义（与 expo-av 对齐） ----------

export interface AVPlaybackStatusSuccess {
  isLoaded: true;
  uri?: string;
  progressUpdateIntervalMillis: number;
  durationMillis?: number;
  positionMillis: number;
  playableDurationMillis?: number;
  shouldPlay: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  rate: number;
  shouldCorrectPitch: boolean;
  volume: number;
  isMuted: boolean;
  audioPan: number;
  isLooping: boolean;
  didJustFinish: boolean;
}

export interface AVPlaybackStatusError {
  isLoaded: false;
  error?: string;
}

export type AVPlaybackStatus = AVPlaybackStatusSuccess | AVPlaybackStatusError;

export type AVPlaybackStatusToSet = Partial<{
  progressUpdateIntervalMillis: number;
  positionMillis: number;
  shouldPlay: boolean;
  rate: number;
  shouldCorrectPitch: boolean;
  volume: number;
  isMuted: boolean;
  audioPan: number;
  isLooping: boolean;
}>;

export type AVPlaybackSource =
  | number
  | { uri: string; overrideFileExtensionAndroid?: string; headers?: Record<string, string> }
  | { localUri: string };

export interface SoundObject {
  sound: HarmonySound;
  status: AVPlaybackStatus;
}

export enum InterruptionModeIOS {
  DoNotMix = 'DoNotMix',
  DuckOthers = 'DuckOthers',
}

export enum InterruptionModeAndroid {
  DoNotMix = 'DoNotMix',
  DuckOthers = 'DuckOthers',
}

// 仅导出 Video 占位，避免 import 报错
export const ResizeMode = {
  CONTAIN: 'contain' as const,
  COVER: 'cover' as const,
  STRETCH: 'stretch' as const,
};

// ---------- 内部常量 ----------

const DEFAULT_INITIAL_STATUS: Required<AVPlaybackStatusToSet> = {
  progressUpdateIntervalMillis: 500,
  positionMillis: 0,
  shouldPlay: false,
  rate: 1.0,
  shouldCorrectPitch: false,
  volume: 1.0,
  isMuted: false,
  audioPan: 0,
  isLooping: false,
};

// ---------- HarmonySound ----------

class HarmonySound {
  private _rnSound: any = null;
  private _loaded = false;
  private _playing = false;
  private _uri = '';
  private _volume = 1.0;
  private _rate = 1.0;
  private _isMuted = false;
  private _isLooping = false;
  private _positionMillis = 0;
  private _durationMillis: number | undefined;
  private _shouldPlay = false;
  private _onPlaybackStatusUpdate: ((status: AVPlaybackStatus) => void) | null = null;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _progressUpdateIntervalMillis = 500;

  /** @deprecated 使用 createAsync */
  static create = async (
    source: AVPlaybackSource,
    initialStatus?: AVPlaybackStatusToSet,
    onPlaybackStatusUpdate?: ((status: AVPlaybackStatus) => void) | null,
    downloadFirst?: boolean
  ): Promise<SoundObject> => {
    return HarmonySound.createAsync(source, initialStatus, onPlaybackStatusUpdate, downloadFirst);
  };

  static createAsync = async (
    source: AVPlaybackSource,
    initialStatus: AVPlaybackStatusToSet = {},
    onPlaybackStatusUpdate: ((status: AVPlaybackStatus) => void) | null = null,
    _downloadFirst = true
  ): Promise<SoundObject> => {
    const sound = new HarmonySound();
    if (onPlaybackStatusUpdate) {
      sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
    }
    const status = await sound.loadAsync(source, initialStatus, _downloadFirst);
    return { sound, status };
  };

  async loadAsync(
    source: AVPlaybackSource,
    initialStatus: AVPlaybackStatusToSet = {},
    _downloadFirst = true
  ): Promise<AVPlaybackStatus> {
    if (this._loaded) throw new Error('The Sound is already loaded.');

    // 解析 URI
    let uri: string | undefined;
    const src = source as any;
    if (typeof source === 'string') {
      uri = source;
    } else if (src && 'uri' in src) {
      uri = src.uri;
    } else if (src && 'localUri' in src) {
      uri = src.localUri;
    } else if (typeof source === 'number') {
      // require() 形式的本地资源，harmony 暂不支持
      throw new Error('Numeric source (require) is not supported on harmony.');
    }
    if (!uri) throw new Error('Cannot load sound from a null source.');

    this._uri = uri;
    const fullStatus = { ...DEFAULT_INITIAL_STATUS, ...initialStatus };

    // 动态 require，使用 harmony.alias
    const RNSound = require('react-native-sound').default;

    return new Promise<AVPlaybackStatus>((resolve, reject) => {
      this._rnSound = new RNSound(uri, '', (error: string | null) => {
        if (error) {
          reject(new Error(error));
          return;
        }
        this._loaded = true;
        this._durationMillis =
          this._rnSound.getDuration() > 0 ? this._rnSound.getDuration() * 1000 : undefined;

        // 应用初始状态
        this._applyStatus(fullStatus);
        const status = this._buildStatus();
        this._notifyStatusUpdate(status);
        resolve(status);
      });
    });
  }

  async unloadAsync(): Promise<AVPlaybackStatus> {
    if (this._loaded) {
      this._stopPolling();
      this._playing = false;
      this._loaded = false;
      if (this._rnSound) {
        this._rnSound.release();
        this._rnSound = null;
      }
    }
    const status = this._buildUnloadedStatus();
    this._notifyStatusUpdate(status);
    return status;
  }

  async playAsync(): Promise<AVPlaybackStatus> {
    if (!this._loaded) throw new Error('Cannot complete operation because sound is not loaded.');
    this._playing = true;
    this._shouldPlay = true;
    this._startPolling();

    this._rnSound.play((success: boolean) => {
      this._playing = false;
      this._stopPolling();
      // 更新最终位置
      this._syncPosition();
      if (success && this._loaded) {
        if (this._isLooping) {
          this._rnSound.setCurrentTime(0);
          this._positionMillis = 0;
          this.playAsync(); // 重新播放
        } else {
          const status = this._buildStatus({ didJustFinish: true });
          this._notifyStatusUpdate(status);
        }
      }
    });

    const status = this._buildStatus();
    this._notifyStatusUpdate(status);
    return status;
  }

  async pauseAsync(): Promise<AVPlaybackStatus> {
    if (!this._loaded) throw new Error('Cannot complete operation because sound is not loaded.');
    this._shouldPlay = false;
    this._playing = false;
    this._stopPolling();
    this._syncPosition();
    this._rnSound.pause();
    const status = this._buildStatus();
    this._notifyStatusUpdate(status);
    return status;
  }

  async stopAsync(): Promise<AVPlaybackStatus> {
    if (!this._loaded) throw new Error('Cannot complete operation because sound is not loaded.');
    this._shouldPlay = false;
    this._playing = false;
    this._stopPolling();
    // 鸿蒙 react-native-sound 的 stop() 不可靠，用 pause + 重置位置代替
    this._rnSound.pause();
    this._rnSound.setCurrentTime(0);
    this._positionMillis = 0;
    const status = this._buildStatus();
    this._notifyStatusUpdate(status);
    return status;
  }

  async setPositionAsync(positionMillis: number): Promise<AVPlaybackStatus> {
    if (!this._loaded) throw new Error('Cannot complete operation because sound is not loaded.');
    this._positionMillis = positionMillis;
    this._rnSound.setCurrentTime(positionMillis / 1000);
    const status = this._buildStatus();
    this._notifyStatusUpdate(status);
    return status;
  }

  async setVolumeAsync(volume: number): Promise<AVPlaybackStatus> {
    if (!this._loaded) throw new Error('Cannot complete operation because sound is not loaded.');
    this._volume = volume;
    this._rnSound.setVolume(this._isMuted ? 0 : volume);
    const status = this._buildStatus();
    this._notifyStatusUpdate(status);
    return status;
  }

  async setIsMutedAsync(isMuted: boolean): Promise<AVPlaybackStatus> {
    if (!this._loaded) throw new Error('Cannot complete operation because sound is not loaded.');
    this._isMuted = isMuted;
    this._rnSound.setVolume(isMuted ? 0 : this._volume);
    const status = this._buildStatus();
    this._notifyStatusUpdate(status);
    return status;
  }

  async setIsLoopingAsync(isLooping: boolean): Promise<AVPlaybackStatus> {
    if (!this._loaded) throw new Error('Cannot complete operation because sound is not loaded.');
    this._isLooping = isLooping;
    this._rnSound.setNumberOfLoops(isLooping ? -1 : 0);
    const status = this._buildStatus();
    this._notifyStatusUpdate(status);
    return status;
  }

  async setRateAsync(rate: number): Promise<AVPlaybackStatus> {
    if (!this._loaded) throw new Error('Cannot complete operation because sound is not loaded.');
    this._rate = rate;
    this._rnSound.setSpeed(rate);
    const status = this._buildStatus();
    this._notifyStatusUpdate(status);
    return status;
  }

  async setProgressUpdateIntervalAsync(millis: number): Promise<AVPlaybackStatus> {
    this._progressUpdateIntervalMillis = millis;
    const status = this._buildStatus();
    return status;
  }

  async getStatusAsync(): Promise<AVPlaybackStatus> {
    if (!this._loaded) {
      const status = this._buildUnloadedStatus();
      this._notifyStatusUpdate(status);
      return status;
    }
    this._syncPosition();
    return this._buildStatus();
  }

  setOnPlaybackStatusUpdate(callback: ((status: AVPlaybackStatus) => void) | null): void {
    this._onPlaybackStatusUpdate = callback;
    // 立即推送一次当前状态
    if (callback) {
      if (this._loaded) {
        this._syncPosition();
        callback(this._buildStatus());
      } else {
        callback(this._buildUnloadedStatus());
      }
    }
  }

  async replayAsync(status: AVPlaybackStatusToSet = {}): Promise<AVPlaybackStatus> {
    if (this._loaded) {
      this._rnSound.setCurrentTime(0);
      this._positionMillis = 0;
    }
    return this.playAsync();
  }

  // ---- 私有方法 ----

  private _applyStatus(status: Required<AVPlaybackStatusToSet>) {
    this._volume = status.volume;
    this._rate = status.rate;
    this._isMuted = status.isMuted;
    this._isLooping = status.isLooping;
    this._shouldPlay = status.shouldPlay;
    this._progressUpdateIntervalMillis = status.progressUpdateIntervalMillis;

    if (this._rnSound) {
      this._rnSound.setVolume(status.isMuted ? 0 : status.volume);
      this._rnSound.setNumberOfLoops(status.isLooping ? -1 : 0);
      this._rnSound.setSpeed(status.rate);
      if (status.positionMillis > 0) {
        this._rnSound.setCurrentTime(status.positionMillis / 1000);
        this._positionMillis = status.positionMillis;
      }
    }

    if (status.shouldPlay && this._loaded) {
      this.playAsync();
    }
  }

  private _syncPosition() {
    if (!this._loaded || !this._rnSound) return;
    // react-native-sound 的 getCurrentTime 是回调式
    // 这里通过事件监听同步的 _playing 状态和 polling 来更新
  }

  private _buildStatus(overrides?: Partial<AVPlaybackStatusSuccess>): AVPlaybackStatusSuccess {
    return {
      isLoaded: true,
      uri: this._uri,
      progressUpdateIntervalMillis: this._progressUpdateIntervalMillis,
      durationMillis: this._durationMillis,
      positionMillis: this._positionMillis,
      playableDurationMillis: this._durationMillis,
      shouldPlay: this._shouldPlay,
      isPlaying: this._playing,
      isBuffering: false,
      rate: this._rate,
      shouldCorrectPitch: false,
      volume: this._volume,
      isMuted: this._isMuted,
      audioPan: 0,
      isLooping: this._isLooping,
      didJustFinish: false,
      ...overrides,
    };
  }

  private _buildUnloadedStatus(error?: string): AVPlaybackStatusError {
    return { isLoaded: false, ...(error ? { error } : {}) };
  }

  private _notifyStatusUpdate(status: AVPlaybackStatus) {
    if (this._onPlaybackStatusUpdate) {
      this._onPlaybackStatusUpdate(status);
    }
  }

  private _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(() => {
      if (!this._loaded || !this._rnSound || !this._playing) return;
      // react-native-sound getCurrentTime 是异步回调
      this._rnSound.getCurrentTime((seconds: number) => {
        this._positionMillis = Math.round(seconds * 1000);
        this._notifyStatusUpdate(this._buildStatus());
      });
    }, this._progressUpdateIntervalMillis);
  }

  private _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }
}

// ---------- Audio 模块（与 expo-av 导出对齐） ----------

export const Audio = {
  Sound: HarmonySound,

  setAudioModeAsync: async (_mode: Record<string, any>): Promise<void> => {
    // harmony 平台不需要配置 audio mode，直接忽略
  },

  requestPermissionsAsync: async (): Promise<{ granted: boolean }> => {
    // harmony 音频播放不需要特殊权限
    return { granted: true };
  },
};

// 兼容 `import { Sound } from 'expo-av/build/Audio'`
export const Sound = HarmonySound;

// Video 占位组件（仅用于避免 import 报错，鸿蒙端应使用 expo-video）
export const Video = (() => {
  throw new Error('expo-av Video is not supported on harmony. Use expo-video instead.');
}) as any;

// 默认导出
export default { Audio, Video, Sound, ResizeMode, InterruptionModeIOS, InterruptionModeAndroid };
