#pragma once
#include <array>
namespace expo::image::harmony {
inline constexpr std::array props = {
  "source", "placeholder", "contentFit", "placeholderContentFit", "contentPosition", "transition",
  "blurRadius", "tintColor", "priority", "cachePolicy", "responsivePolicy", "recyclingKey", "autoplay",
  "focusable", "accessible", "accessibilityLabel", "enableLiveTextInteraction", "allowDownscaling",
  "decodeFormat", "useAppleWebpCodec", "enforceEarlyResizing"
};
inline constexpr std::array events = {"onLoadStart", "onLoad", "onProgress", "onError", "onDisplay"};
}
