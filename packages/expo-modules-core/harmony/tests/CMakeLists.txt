cmake_minimum_required(VERSION 3.16)
project(expo_core_harmony_runtime_test LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
option(EXPO_CORE_RUNTIME_TESTS "Include Expo runtime integration tests" ON)

if(NOT IS_DIRECTORY "${RNOH_PACKAGE_DIR}/src/main/cpp/third-party")
  message(FATAL_ERROR "RNOH_PACKAGE_DIR must point to the unpacked RNOH 0.82.30 HAR package")
endif()
set(RNOH_THIRD_PARTY "${RNOH_PACKAGE_DIR}/src/main/cpp/third-party")
set(EXPO_CORE_COMMON "${CMAKE_CURRENT_SOURCE_DIR}/../../common/cpp")
set(EXPO_CORE_HARMONY "${CMAKE_CURRENT_SOURCE_DIR}/../src/main/cpp")

add_library(jsi SHARED "${RNOH_THIRD_PARTY}/rn/ReactCommon/jsi/jsi/jsi.cpp")
target_include_directories(jsi PUBLIC "${RNOH_THIRD_PARTY}/rn/ReactCommon/jsi")

add_library(hermesvm SHARED IMPORTED)
set_target_properties(hermesvm PROPERTIES IMPORTED_LOCATION
  "${RNOH_THIRD_PARTY}/prebuilt/${OHOS_ARCH}/libhermesvm.so")

add_executable(expo_core_runtime_test RuntimeTest.cpp)
target_include_directories(expo_core_runtime_test PRIVATE
  "${RNOH_THIRD_PARTY}/hermes/API"
  "${RNOH_THIRD_PARTY}/hermes/public")
target_link_libraries(expo_core_runtime_test PRIVATE hermesvm jsi)

if(EXPO_CORE_RUNTIME_TESTS)
  target_compile_definitions(expo_core_runtime_test PRIVATE EXPO_CORE_RUNTIME_TESTS=1)
  target_include_directories(expo_core_runtime_test PRIVATE
    "${EXPO_CORE_HARMONY}" "${EXPO_CORE_COMMON}"
    "${RNOH_THIRD_PARTY}/rn/ReactCommon")
  target_sources(expo_core_runtime_test PRIVATE
    "${EXPO_CORE_HARMONY}/ExpoModulesCoreRuntime.cpp"
    "${EXPO_CORE_COMMON}/EventEmitter.cpp"
    "${EXPO_CORE_COMMON}/JSIUtils.cpp"
    "${EXPO_CORE_COMMON}/LazyObject.cpp"
    "${EXPO_CORE_COMMON}/NativeModule.cpp"
    "${EXPO_CORE_COMMON}/SharedObject.cpp"
    "${EXPO_CORE_COMMON}/SharedRef.cpp")
endif()

if(EXPO_CORE_RUNTIME_TESTS)
  add_executable(expo_core_async_test AsyncTest.cpp)
  get_target_property(RUNTIME_TEST_SOURCES expo_core_runtime_test SOURCES)
  list(FILTER RUNTIME_TEST_SOURCES EXCLUDE REGEX "RuntimeTest.cpp$")
  target_sources(expo_core_async_test PRIVATE ${RUNTIME_TEST_SOURCES}
    "${EXPO_CORE_HARMONY}/ExpoModulesCoreAsync.cpp")
  target_include_directories(expo_core_async_test PRIVATE
    "${EXPO_CORE_HARMONY}" "${EXPO_CORE_COMMON}"
    "${RNOH_THIRD_PARTY}/hermes/API" "${RNOH_THIRD_PARTY}/hermes/public"
    "${RNOH_THIRD_PARTY}/rn/ReactCommon"
    "${RNOH_THIRD_PARTY}/rn/ReactCommon/callinvoker")
  target_link_libraries(expo_core_async_test PRIVATE hermesvm jsi)
endif()
