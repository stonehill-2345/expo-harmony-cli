# Font-v1 shared fixture

Use `prepare-fixture.cjs --i0 --linking --font` with the fixed Core-v1-v3 HAR.
The fixture installs the exact `@expo/vector-icons`15.1.1 package, registers the
real ExpoFontLoader package on C++/ETS sides and retains all prior I0/Linking
checks. Router is not installed. Device acceptance and unsupported boundaries are
recorded in the Font-v1 evidence; this directory is not autolinking/prebuild.
