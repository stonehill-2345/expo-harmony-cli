#!/usr/bin/env python3
"""Install the SDK54 source-analysis prerequisites into the ignored task cache."""
import concurrent.futures
import hashlib
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2] / '.tmp/sdk54/tooling'
MAVEN = 'https://repo.maven.apache.org/maven2/'
ARTIFACTS = [
    ('kotlin/kotlin-compiler.jar', MAVEN + 'org/jetbrains/kotlin/kotlin-compiler/2.2.21/kotlin-compiler-2.2.21.jar', '0885d5546e3a18d8509ae99aaf735decc7b88e0c33fc0287b5f74bc085a7cff5'),
    ('kotlin/kotlin-stdlib.jar', MAVEN + 'org/jetbrains/kotlin/kotlin-stdlib/2.2.21/kotlin-stdlib-2.2.21.jar', '6558a3d233da56a20934b32159f9db5f86ed5816ef098f78a2c223dc6abb79dd'),
    ('kotlin/kotlinx-coroutines-core-jvm.jar', MAVEN + 'org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/1.8.0/kotlinx-coroutines-core-jvm-1.8.0.jar', '9860906a1937490bf5f3b06d2f0e10ef451e65b95b269f22daf68a3d1f5065c5'),
    ('kotlin/annotations-13.0.jar', MAVEN + 'org/jetbrains/annotations/13.0/annotations-13.0.jar', 'ace2a10dc8e2d5fd34925ecac03e4988b2c0f851650c94b8cef49ba1bd111478'),
    ('groovy/groovy-3.0.24.jar', MAVEN + 'org/codehaus/groovy/groovy/3.0.24/groovy-3.0.24.jar', 'abdadffeb2ce15e375f16b13f5bbe634c30b54791d62da38bd4ad3d5a4e89da9'),
    ('groovy/groovy-json-3.0.24.jar', MAVEN + 'org/codehaus/groovy/groovy-json/3.0.24/groovy-json-3.0.24.jar', 'ef4d87d552e847978fed8d4a78a0e928f7f05d5fca43f8febe60b166e8f78d02'),
    ('proguard.jar', MAVEN + 'net/sf/proguard/proguard-base/6.0.3/proguard-base-6.0.3.jar', '75bc89695fa66e75374ecda439b802406f0ab1d826dd386eed0a23b1f0a9d264'),
]
SHFMT_HASHES = {
    ('darwin', 'arm64'): 'd903802e0ce3ecbc82b98512f55ba370b0d37a93f3f78de394f5b657052b33dd',
    ('darwin', 'amd64'): 'c31548693de6584e6164b7ed5fbb7b4a083f2d937ca94b4e0ddf59aa461a85e4',
    ('linux', 'arm64'): '5f3fe3fa6a9f766e6a182ba79a94bef8afedafc57db0b1ad32b0f67fae971ba4',
    ('linux', 'amd64'): 'd9fbb2a9c33d13f47e7618cf362a914d029d02a6df124064fff04fd688a745ea',
}


def fetch(artifact):
    name, url, expected = artifact
    destination = ROOT / name
    if destination.is_file() and hashlib.sha256(destination.read_bytes()).hexdigest() == expected:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=destination.parent)
    os.close(handle)
    try:
        subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error',
                        '--retry', '1', '--max-time', '180', '--output', temporary, url], check=True)
        if hashlib.sha256(Path(temporary).read_bytes()).hexdigest() != expected:
            raise RuntimeError('Tool checksum mismatch: ' + name)
        os.replace(temporary, destination)
    finally:
        Path(temporary).unlink(missing_ok=True)


def main():
    machine = {'x86_64': 'amd64', 'aarch64': 'arm64'}.get(platform.machine(), platform.machine())
    system = platform.system().lower()
    digest = SHFMT_HASHES[(system, machine)]
    artifacts = ARTIFACTS + [('shfmt', f'https://github.com/mvdan/sh/releases/download/v3.12.0/shfmt_v3.12.0_{system}_{machine}', digest)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(fetch, artifacts))
    (ROOT / 'shfmt').chmod(0o755)
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check',
                    '--target', str(ROOT / 'cmakelang'), '--upgrade', 'cmakelang==0.6.13', 'six==1.17.0'], check=True)
    print('SDK54 analysis tools ready. Full source tests also require JDK 17+ and macOS/Xcode SwiftSyntax.')


if __name__ == '__main__':
    main()
