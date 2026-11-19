#include "ImageRequest.h"
#include <cassert>
#include <iostream>
using namespace expo::image::harmony;
int main() {
  assert(resolvePngUri("asset://images/logo.png", "resource://RAWFILE/assets/") == "resource://RAWFILE/assets/images/logo.png");
  assert(resolvePngUri("https://example.test/logo.png?platform=harmony", "") == "https://example.test/logo.png?platform=harmony");
  assert(resolvePngUri("file:///cache/logo.png", "") == "file:///cache/logo.png");
  // Expo Metro puts the filename in unstable_path. RNOH appends a second '?'.
  for (const auto* uri : {
      "http://127.0.0.1:8097/assets/?unstable_path=.%2Fassets%2Fimages/react-logo@3x.png?platform=harmony&hash=abc",
      "http://127.0.0.1:8097/assets/?unstable_path=.%2Fassets%2Fimages/partial-react-logo.png&platform=harmony",
      "https://example.test/assets/?platform=harmony&unstable_path=.%2Fimages/logo.png"}) {
    assert(resolvePngUri(uri, "") == uri);
  }
  for (const auto* uri : {
      "http://localhost/assets/?unstable_path=images/logo.gif&name=logo.png",
      "http://localhost/assets/?unstable_path=images/logo.png.gif",
      "http://localhost/assets/?other_unstable_path=images/logo.png",
      "http://localhost/other/?unstable_path=images/logo.png",
      "file:///assets/?unstable_path=images/logo.png",
      "http://localhost/assets/?unstable_path=logo.png&unstable_path=logo.gif",
      "http://localhost/assets/?unstable_path=logo.png#fragment"}) {
    bool failed = false;
    try { resolvePngUri(uri, ""); } catch (const std::invalid_argument&) { failed = true; }
    assert(failed);
  }
  for (const auto* uri : {"", "logo.png", "asset://../logo.png", "asset://%2e%2e/logo.png", "https://example.test/logo.gif", "file:///cache/a.png#other", "data:image/png;base64,test"}) {
    bool failed = false;
    try { resolvePngUri(uri, "resource://RAWFILE/assets/"); } catch (const std::invalid_argument&) { failed = true; }
    assert(failed);
  }
  ImageRequest request;
  auto first = request.begin();
  assert(request.accepts(first));
  auto second = request.begin();
  assert(!request.accepts(first));
  assert(!request.finish(first));
  assert(request.finish(second));
  assert(!request.finish(second));
  assert(!request.accepts(second));
  auto third = request.begin();request.cancel();
  assert(!request.finish(third));
  auto fourth = request.begin();assert(request.finish(fourth));
  std::cout << "PNG URI validation and stale/duplicate/cancelled request rejection passed\n";
}
