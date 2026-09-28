cmake_minimum_required(VERSION 3.16)

if(NOT TARGET rnoh)
  message(FATAL_ERROR "Add RNOH 0.82.30 before expo-web-browser")
endif()

add_library(rnoh_expo_web_browser STATIC ExpoWebBrowserTurboModule.cpp)
target_compile_features(rnoh_expo_web_browser PUBLIC cxx_std_20)
target_include_directories(rnoh_expo_web_browser PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(rnoh_expo_web_browser PUBLIC rnoh)
