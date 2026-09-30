cmake_minimum_required(VERSION 3.16)
project(expo_harmony_app LANGUAGES C CXX ASM)
set(CMAKE_CXX_STANDARD 20)
set(RNOH_APP_DIR "${CMAKE_CURRENT_SOURCE_DIR}")
set(RNOH_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules/@rnoh/react-native-openharmony/src/main/cpp")
set(OH_MODULES_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules")
set(ENABLE_COMPILE_OPTIMIZATIONS OFF CACHE BOOL "Disable PGO until Expo Harmony release validation" FORCE)
add_subdirectory("${RNOH_CPP_DIR}" rnoh)
add_library(rnoh_app SHARED
  generated/ExpoModulesPackages.cpp
  "${RNOH_CPP_DIR}/RNOHAppNapiBridge.cpp"
)
target_link_libraries(rnoh_app PUBLIC rnoh)
include("${CMAKE_CURRENT_SOURCE_DIR}/generated/expo-modules.cmake")
