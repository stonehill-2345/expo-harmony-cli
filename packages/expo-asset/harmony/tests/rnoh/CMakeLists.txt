cmake_minimum_required(VERSION 3.16)
project(expo_asset_rnoh_package_check LANGUAGES C CXX ASM)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(ENABLE_COMPILE_OPTIMIZATIONS OFF CACHE BOOL "Disable RNOH PGO for the compile test" FORCE)

if(NOT DEFINED RNOH_PACKAGE_DIR)
  message(FATAL_ERROR "RNOH_PACKAGE_DIR must point to the RNOH package directory")
endif()
set(RNOH_CPP_DIR "${RNOH_PACKAGE_DIR}/src/main/cpp")
set(RNOH_APP_DIR "${CMAKE_CURRENT_SOURCE_DIR}")

add_subdirectory("${RNOH_CPP_DIR}" rnoh EXCLUDE_FROM_ALL)
add_subdirectory("${CMAKE_CURRENT_LIST_DIR}/../../src/main/cpp" expo-asset EXCLUDE_FROM_ALL)

add_library(expo_asset_package_compile_check OBJECT PackageCompileTest.cpp)
target_include_directories(
  expo_asset_package_compile_check
  PRIVATE "${CMAKE_CURRENT_LIST_DIR}/../../src/main/cpp")
target_link_libraries(expo_asset_package_compile_check PRIVATE rnoh_expo_asset)
