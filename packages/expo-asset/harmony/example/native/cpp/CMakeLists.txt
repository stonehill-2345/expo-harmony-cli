cmake_minimum_required(VERSION 3.16)

add_library(lane_b_asset_oracle STATIC LaneBAssetOracleTurboModule.cpp)
target_compile_features(lane_b_asset_oracle PUBLIC cxx_std_17)
target_include_directories(lane_b_asset_oracle PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(lane_b_asset_oracle PUBLIC rnoh)
