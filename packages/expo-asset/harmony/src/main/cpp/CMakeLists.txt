cmake_minimum_required(VERSION 3.13)
project(rnoh_expo_asset)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(rnoh_expo_asset STATIC ExpoAssetTurboModule.cpp)
target_include_directories(rnoh_expo_asset PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(rnoh_expo_asset PUBLIC rnoh)
