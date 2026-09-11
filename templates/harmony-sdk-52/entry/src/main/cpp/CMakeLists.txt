cmake_minimum_required(VERSION 3.11)
project(rnapp)

set(RNOH_APP_DIR "${CMAKE_CURRENT_SOURCE_DIR}")
set(NODE_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../node_modules")
set(RNOH_GENERATED_DIR "${CMAKE_CURRENT_SOURCE_DIR}/generated")
set(LOG_VERBOSITY_LEVEL 1)
set(CMAKE_ASM_FLAGS "-Wno-error=unused-command-line-argument -Qunused-arguments")
set(CMAKE_CXX_FLAGS "-fstack-protector-strong -Wl,-z,relro,-z,now,-z,noexecstack -s -fPIE -pie")
set(WITH_HITRACE_SYSTRACE ON)
set(WITH_HITRACE_REACT_MARKER ON)
set(OH_MODULES_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../oh_modules") # required by 'autolink_libraries'

function(resolve_oh_package_cpp out_var package_name)
    set(direct_cpp_dir "${OH_MODULES_DIR}/${package_name}/src/main/cpp")
    if(EXISTS "${direct_cpp_dir}")
        set(${out_var} "${direct_cpp_dir}" PARENT_SCOPE)
        return()
    endif()

    string(REPLACE "/" "+" package_key "${package_name}")
    file(GLOB ohpm_cpp_dirs "${OH_MODULES_DIR}/.ohpm/${package_key}*/oh_modules/${package_name}/src/main/cpp")
    list(LENGTH ohpm_cpp_dirs ohpm_cpp_dir_count)
    if(ohpm_cpp_dir_count GREATER 0)
        list(GET ohpm_cpp_dirs 0 resolved_cpp_dir)
        set(${out_var} "${resolved_cpp_dir}" PARENT_SCOPE)
        return()
    endif()

    message(FATAL_ERROR "Unable to resolve Harmony package C++ directory for ${package_name}. Run ohpm install and check harmony/oh_modules.")
endfunction()

resolve_oh_package_cpp(RNOH_CPP_DIR "@rnoh/react-native-openharmony")

add_subdirectory("${RNOH_CPP_DIR}" ./rn)

include("${CMAKE_CURRENT_SOURCE_DIR}/autolinking.cmake")

file(GLOB GENERATED_CPP_FILES "${CMAKE_CURRENT_SOURCE_DIR}/generated/*.cpp") # this line is needed by codegen v1
add_library(rnoh_app SHARED
    ${GENERATED_CPP_FILES}
    "./PackageProvider.cpp"
    "${RNOH_CPP_DIR}/RNOHAppNapiBridge.cpp"
)
target_link_libraries(rnoh_app PUBLIC rnoh)

autolink_libraries(rnoh_app)
