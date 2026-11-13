#pragma once
#include <cstdint>
#include <stdexcept>
#include <string>

namespace expo::image::harmony {
inline std::string resolvePngUri(const std::string& uri, const std::string& assetPrefix) {
  const auto end = uri.find('?');
  const auto path = uri.substr(0, end);
  bool pngPath = path.ends_with(".png");
  const bool network = uri.starts_with("https://") || uri.starts_with("http://");
  if (!pngPath && network && path.ends_with("/assets/") && end != std::string::npos) {
    // Expo Metro carries the filename in a query value. RNOH may append
    // '?platform=...' to that value instead of using another '&' parameter.
    bool found = false;
    for (auto start = end + 1; start < uri.size();) {
      const auto next = uri.find('&', start);
      const auto field = uri.substr(start, next == std::string::npos ? next : next - start);
      if (field.starts_with("unstable_path=")) {
        if (found) { pngPath = false; break; }
        found = true;
        const auto value = field.substr(14);
        pngPath = value.substr(0, value.find('?')).ends_with(".png");
      }
      if (next == std::string::npos) break;
      start = next + 1;
    }
  }
  if (!pngPath || uri.find('#') != std::string::npos || uri.find('\0') != std::string::npos) {
    throw std::invalid_argument("ERR_IMAGE_UNSUPPORTED: this Harmony implementation accepts PNG URI sources");
  }
  if (uri.starts_with("asset://")) {
    const auto name = uri.substr(8);
    if (name.empty() || name.front() == '/' || name.find("..") != std::string::npos ||
        name.find('%') != std::string::npos || name.find('\\') != std::string::npos || end != std::string::npos) {
      throw std::invalid_argument("ERR_IMAGE_SOURCE: invalid bundled asset path");
    }
    return assetPrefix + name;
  }
  if (uri.starts_with("file:///") || uri.starts_with("resource://RAWFILE/") ||
      uri.starts_with("https://") || uri.starts_with("http://")) return uri;
  throw std::invalid_argument("ERR_IMAGE_SOURCE: unsupported image URI scheme");
}

// Each native node owns a generation. Replacing/removing it invalidates queued events.
class ImageRequest {
public:
  uint64_t begin() { loading_ = true; return ++generation_; }
  void cancel() { ++generation_; loading_ = false; }
  bool accepts(uint64_t generation) const { return loading_ && generation == generation_; }
  bool finish(uint64_t generation) {
    if (!accepts(generation)) return false;
    loading_ = false;
    return true;
  }
private:
  uint64_t generation_ = 0;
  bool loading_ = false;
};
}
