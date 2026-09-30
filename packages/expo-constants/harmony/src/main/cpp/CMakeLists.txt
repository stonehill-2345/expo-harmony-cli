cmake_minimum_required(VERSION 3.16)

if(NOT TARGET rnoh)
  message(FATAL_ERROR "Add the RNOH 0.82.30 native project before expo-constants")
endif()

add_library(rnoh_expo_constants STATIC ExponentConstantsTurboModule.cpp)
target_compile_features(rnoh_expo_constants PUBLIC cxx_std_20)
target_include_directories(rnoh_expo_constants PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(rnoh_expo_constants PUBLIC rnoh)
