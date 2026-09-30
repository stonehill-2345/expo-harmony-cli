cmake_minimum_required(VERSION 3.16)
project(expo_core_rnoh_package_check LANGUAGES C CXX ASM)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(ENABLE_COMPILE_OPTIMIZATIONS OFF CACHE BOOL "Disable RNOH PGO for the integration compile test" FORCE)
set(RNOH_CPP_DIR "${RNOH_PACKAGE_DIR}/src/main/cpp")
set(RNOH_APP_DIR "${CMAKE_CURRENT_SOURCE_DIR}")
add_subdirectory("${RNOH_CPP_DIR}" rnoh EXCLUDE_FROM_ALL)
add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../src/main/cpp" expo-core EXCLUDE_FROM_ALL)
add_library(expo_core_package_compile_check OBJECT
  PackageCompileTest.cpp
  "${CMAKE_CURRENT_SOURCE_DIR}/../../src/main/cpp/ExpoModulesCorePackage.cpp")
target_include_directories(expo_core_package_compile_check PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/../../src/main/cpp")
target_link_libraries(expo_core_package_compile_check PRIVATE rnoh_expo_modules_core)
