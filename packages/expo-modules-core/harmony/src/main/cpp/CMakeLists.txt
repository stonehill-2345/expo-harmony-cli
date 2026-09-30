cmake_minimum_required(VERSION 3.16)

if(NOT TARGET rnoh OR NOT TARGET jsi)
  message(FATAL_ERROR "Add the RNOH 0.82.30 native project before Expo Modules Core")
endif()
get_filename_component(EXPO_MODULES_CORE_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
set(EXPO_MODULES_CORE_COMMON "${EXPO_MODULES_CORE_ROOT}/common/cpp")

file(READ "${EXPO_MODULES_CORE_ROOT}/package.json" EXPO_CORE_PACKAGE_JSON)
string(REGEX MATCH "\"version\"[ \t]*:[ \t]*\"([^\"]+)\"" EXPO_CORE_VERSION_MATCH "${EXPO_CORE_PACKAGE_JSON}")
set(EXPO_CORE_VERSION "${CMAKE_MATCH_1}")
if(NOT EXPO_CORE_VERSION MATCHES "^([0-9]+)\\.([0-9]+)\\.([0-9]+)")
  message(FATAL_ERROR "Invalid Expo Modules Core package version: ${EXPO_CORE_VERSION}")
endif()
set(EXPO_CORE_VERSION_MAJOR "${CMAKE_MATCH_1}")
set(EXPO_CORE_VERSION_MINOR "${CMAKE_MATCH_2}")
set(EXPO_CORE_VERSION_PATCH "${CMAKE_MATCH_3}")
configure_file(ExpoModulesCoreVersion.h.in ExpoModulesCoreVersion.h @ONLY)

add_library(rnoh_expo_modules_core STATIC
  ExpoModulesCorePackage.cpp
  ExpoModulesCoreRuntime.cpp
  ExpoModulesCoreAsync.cpp
  ExpoModulesCoreViewBinding.cpp
  "${EXPO_MODULES_CORE_COMMON}/EventEmitter.cpp"
  "${EXPO_MODULES_CORE_COMMON}/JSIUtils.cpp"
  "${EXPO_MODULES_CORE_COMMON}/LazyObject.cpp"
  "${EXPO_MODULES_CORE_COMMON}/NativeModule.cpp"
  "${EXPO_MODULES_CORE_COMMON}/SharedObject.cpp"
  "${EXPO_MODULES_CORE_COMMON}/SharedRef.cpp")
target_compile_features(rnoh_expo_modules_core PUBLIC cxx_std_20)
target_include_directories(rnoh_expo_modules_core
  PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}" "${CMAKE_CURRENT_BINARY_DIR}"
  PRIVATE "${EXPO_MODULES_CORE_COMMON}")
target_link_libraries(rnoh_expo_modules_core PUBLIC rnoh jsi)
