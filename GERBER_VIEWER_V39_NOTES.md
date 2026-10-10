# Gerber Viewer V39

- Improved clear-polarity (`LPC`) track splitting by refining each erased/non-erased transition with 28 bisection iterations after coarse sampling.
- Residual track endpoints now more closely follow the clearance boundary adjusted for track width, instead of being limited to the 0.05 mm sampling grid.
- Strengthened the partial-clearance regression test to check the expected 3.9 mm and 6.1 mm residual endpoints for a 0.2 mm track crossing a 4–6 mm clearance.
- This improves track splitting accuracy but is not a general polygon Boolean engine. Partial intersections with pads and filled zones, and exact circular stroke clipping, remain future work.
- Build and tests were not run in this environment because project dependencies are not installed.
