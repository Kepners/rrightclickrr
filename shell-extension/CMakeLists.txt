cmake_minimum_required(VERSION 3.20)
project(RRightclickrrShell VERSION 1.2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Create the DLL with embedded icon resources
add_library(RRightclickrrShell SHARED
    src/dllmain.cpp
    src/ExplorerCommand.cpp
    src/ExplorerCommand.h
    src/resource.h
    src/RRightclickrrShell.rc
    RRightclickrrShell.def
)

# Link required libraries
target_link_libraries(RRightclickrrShell PRIVATE
    shlwapi
    pathcch
    shell32
    ole32
    uuid
)

# Windows-specific settings
if(MSVC)
    target_compile_options(RRightclickrrShell PRIVATE /W4 /WX-)
    target_compile_definitions(RRightclickrrShell PRIVATE
        UNICODE
        _UNICODE
        WIN32_LEAN_AND_MEAN
        NOMINMAX
    )
endif()

# Set output name
set_target_properties(RRightclickrrShell PROPERTIES
    OUTPUT_NAME "RRightclickrrShell"
    PREFIX ""
)

# Install target
install(TARGETS RRightclickrrShell
    RUNTIME DESTINATION shell-extension
    LIBRARY DESTINATION shell-extension
)
