# Gerber Viewer V33

- Fixed clear-polarity standard aperture flashes so LM mirroring, LR rotation, and LS scaling are applied to the flash geometry before subtracting it from prior copper zones.
- Added a regression test for a rectangular LPC flash with 90-degree rotation and 2x scale; expected hole dimensions are 4 mm by 8 mm.
- This remains a conservative contained-shape subtraction path. Partial intersections still require polygon Boolean clipping to fully match Gerber compositing.
- Tests/build were not run in this environment because project dependencies are not installed.
