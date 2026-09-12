# Create and Copycats+ export

This branch adds a **Create + Copycats+ — 1.21.1 (.nbt)** exporter for Minecraft Java **1.21.1 / NeoForge**, plus a plain **Create — 1.21.1 (.nbt)** exporter. Each produces one gzip-compressed structure NBT file, ready for Create's `schematics` directory. The old structure-block exporter still has its separate behaviour.

## Plan and implementation

1. Inspect the existing import → voxelise → assign → export pipeline and the mods' source formats.
2. Keep colour assignment at the detailed voxel resolution, using a conservative palette of full-cube materials with valid items.
3. Group those voxels into Minecraft block cells. Match each cell against legal copycat states, preserving independent materials on multipart blocks. Prefer geometry fidelity, then material fidelity, then fewer material parts. Use an ordinary material block for a uniform full cube.
4. Serialize block states, per-block entity data, material states, and 1.21.1 item stacks into a single Create structure. Avoid the old Copycats+ migration schema.
5. Add UI controls, automated checks, a compact in-game test gallery, and the testing procedure below.

Implemented in `src/copycats/`, `src/exporters/create_exporter.ts`, and the existing worker/UI pipeline. The finite shape catalogue contains **23 copycat block families and 1,775 candidate states**, including the ordinary full-block candidate. A summed-volume table scores cuboids efficiently; a bounded per-export cache reuses repeated cells.

## Version profile

The profile follows **Copycats+ v3.0.9+mc1.21.1**, commit `60923e001d931ccbc2c6b21b0e911a248375186f`. Its NeoForge configuration targets NeoForge 21.1.200+ and Create 6.0.8+. Use the **NeoForge** files for Minecraft **1.21.1**, with all relevant Copycats+ feature categories enabled. Other Copycats+ versions are not verified by this implementation.

The Create structure uses Java DataVersion **3955**. Item stacks use string `id` and integer `count`. Single-material entities use `Material`, `Item`, and `EnableCT`; multipart entities use `material_data` with `material`, `consumedItem`, and `enableCT` per slot. Absent slots retain the default copycat material and an empty consumed item. Each distinct applied material is consumed once per multipart block.

Primary references:

- [Copycats+ version/dependency profile](https://github.com/copycats-plus/copycats/blob/60923e001d931ccbc2c6b21b0e911a248375186f/gradle.properties)
- [Copycats+ shapes and orientation transforms](https://github.com/copycats-plus/copycats/blob/60923e001d931ccbc2c6b21b0e911a248375186f/common/src/main/java/com/copycatsplus/copycats/CCShapes.java)
- [Copycats+ block-entity registrations](https://github.com/copycats-plus/copycats/blob/60923e001d931ccbc2c6b21b0e911a248375186f/common/src/main/java/com/copycatsplus/copycats/CCBlockEntityTypes.java)
- [Multipart material storage](https://github.com/copycats-plus/copycats/blob/60923e001d931ccbc2c6b21b0e911a248375186f/common/src/main/java/com/copycatsplus/copycats/foundation/copycat/multistate/MaterialItemStorage.java)
- [Single-material serialization](https://github.com/copycats-plus/copycats/blob/60923e001d931ccbc2c6b21b0e911a248375186f/common/src/main/java/com/copycatsplus/copycats/foundation/copycat/ICopycatBlockEntity.java)
- [Create schematic export](https://github.com/Creators-of-Create/Create/blob/0924e93639ad5f61cfc39a221d909e16f2893df1/src/main/java/com/simibubi/create/content/schematics/SchematicExport.java)

## Resolution and block coverage

**2× mode is the exact general-purpose option.** Each input voxel becomes a half-block cube. Any of the eight positions in a Minecraft block can be occupied and independently coloured. Eight voxels can share one block position. This gives twice the detail along each axis at the same in-game dimensions, provided you voxelise at twice the intended block dimensions.

**4×, 8×, and 16× modes fit available shapes.** They do not grant arbitrary quarter-, eighth-, or sixteenth-block cubes. Minecraft still stores one block state at each block position, and Copycats+ only permits the combinations its blocks implement. Some thin surfaces, bars, corners, and sloped surfaces fit much better; other geometry or colour patterns require approximation.

| Families in the catalogue | Coverage |
| --- | --- |
| Create copycat panel, step | All six panel facings; four step facings and both halves |
| Copycats+ block, byte | Full block; all 255 nonempty byte masks with separate materials |
| Slab | X/Y/Z axes, bottom/top/double, two material slots |
| Beam, flat pane | All three axes |
| Layer | Six facings, eight thicknesses |
| Half panel, byte panel | All orientations; byte panels have four independent material slots |
| Board | All 63 nonempty face combinations, including box/catwalk layouts |
| Slice, vertical slice, corner slice | All facings and available sizes/halves |
| Half layer, vertical half layer, stacked half layer | All orientations, independent 0–8 layer counts and materials |
| Stairs, vertical stairs | Straight states used automatically; corner states are in the diagnostic catalogue |
| Slope, vertical slope, slope layer | Rendered slopes sampled on a 16-pixel grid; approximation mode only |

The automatic fitter does **not yet cover every Copycats+ registry block**. Doors, trapdoors, fences, walls, connected panes, ladders, buttons, pressure plates, shafts, cogwheels, fluid pipes, and ghost blocks are excluded. Their support, connectivity, moving geometry, or gameplay behaviour requires additional placement logic. They are not silently replaced with guessed block IDs or entity tags. The current work addresses the construction shapes used for increasing model detail; complete functional-block synthesis remains future work.

Corner stairs need matching neighbours to retain their shape. Automatic packing uses independent alternatives for those corners and for perpendicular adjacent stairs. The optional all-states gallery includes corner stair states for inspection; isolated corner stairs in that gallery may straighten when updated.

Strict fitting checks geometry and assigned material fidelity. It excludes continuous slopes, whose rendered faces are not voxel cubes. Approximation mode reports changed geometry pixels and changed material pixels in the editor console; a pixel is 1/16 of a block on each axis. A selected continuous slope is always counted as an approximation, even if its pixel samples agree.

## Test a generated model

From the repository directory:

```powershell
npm ci
npm start
```

Open the local address printed by webpack, normally `http://localhost:8080`. Dependencies have already been installed in this checkout. The lockfile was repaired because the original lockfile omitted an optional `fsevents` dependency required by `npm ci`.

1. Import a small `.obj` or `.glb` model. `res/samples/skull.obj` is available for a smoke test. Missing texture inputs on that sample can be replaced with a solid material for this test.
2. Voxelise. For a structure about **40 blocks tall in 2× mode**, use **Y / Size 80**. For an 80-block structure, use Size 160. Check the voxel dimensions printed in the console after voxelising.
3. In **Assign**, enable **Copycat-safe materials**. This explicitly uses the provided full-cube palette instead of the selection above it. Leave **Calculate lighting** off for this test, and click **Assign blocks**. The existing lighting option may introduce materials outside the conservative Copycat palette.
4. In **Assign**, select **2x** and keep **Require exact geometry and materials** enabled. Click **Preview Copycats** to inspect fitted shapes. In **Export**, choose **Create + Copycats+ - 1.21.1 (.nbt)**.
5. Click **Export structure**. The console reports the final in-game dimensions and block count. The result should be a single lowercase `.nbt` file, not a ZIP.
6. For finer fitting, voxelise at a larger size, reassign, then choose 4×/8×/16×. Try strict fitting first. If the model cannot be represented, it stops with the offending cell coordinate. Switch to **Allow approximation and report differences** only if you accept fitting changes.

**Preview Copycats** works immediately after voxelising, before assigning blocks: each fitted part uses a solid voxel colour. After assignment it uses the assigned material textures, cropped to the part dimensions. If Copycat preview is active, assigning or voxelising again refreshes it automatically. The regular mesh/voxel/block toolbar buttons still show the original views; click **Preview Copycats** to return. After changing the fitting options, click **Preview Copycats** again. Export uses these same options.

The preview uses the export fitter and its cuboid shape catalogue, including multipart skins. Slopes render as continuous planar faces, matching the mod's slope, slope-layer and vertical-slope geometry. Fitting error is still measured using 1/16-block samples. Texture cropping is representative and does not emulate connected textures, seams or in-game lighting. The console reports dimensions, block count and approximation warnings. Before assignment, colours are provisional; assigning materials can change the selected shape.

Increasing the packing factor without increasing voxelisation size makes the in-game build smaller; it does not add new detail by itself. Larger voxelisation sizes also increase memory and processing costs.

## Test in Minecraft before using a large schematic

The repository includes two ready-made files in `examples/create/`:

- **`copycat-byte-colours.nbt`**: one block with eight differently coloured half-block octants. This is the quickest material/schema check.
- **`copycat-showcase.nbt`**: a small gallery with up to three states per supported family, separated on stone pedestals. `copycat-showcase.json` lists local positions, states, and material assignments.

Procedure:

1. Launch a Minecraft 1.21.1 NeoForge instance with Create and Copycats+ matching the profile above.
2. Find **that instance's game directory**. In a modpack launcher, use its instance-folder action. Copy the `.nbt` files into its **`schematics`** folder. This is the game-level directory, not a world's `generated` or `datapacks` directory.
3. In a Creative test world, place a **Schematic Table**, insert an **Empty Schematic**, select the file, and upload it to the schematic item.
4. Position the schematic with Create's controls and use Creative placement. Check that the byte-colour test occupies exactly **one Minecraft block**, with eight differently coloured pieces. The bottom northwest piece is red; the top southeast piece is white.
5. Place the showcase. Compare blocks with the JSON legend, especially vertical slabs, panels, byte panels, layered parts, and boards. There should be no untextured copycat surfaces on occupied parts and no missing block families.
6. Rotate a fresh copy 90°, then test mirroring. Inspect the colours and orientations again. Save and reload the world to confirm material persistence. Place and remove a neighbouring block to check for unwanted shape changes.
7. Try the byte-colour test with a **Schematicannon**. Supply the copycat pieces, all eight concrete materials, and its normal fuel requirements. Confirm that its material list and completed structure match. Then test the showcase and finally your model.

If a file is missing from the table, check its extension and instance directory. Missing blocks point to the mod version or disabled feature categories. Untextured parts or wrong Schematicannon requirements point to material/entity compatibility; inspect a placed block with `/data get block x y z` and compare it with the schema above. Older Copycats+ releases have schematic migration bugs, so record the exact Create and Copycats+ versions when reporting a failure.

## Automated checks and fixture regeneration

```powershell
npm run build
npm test -- --runInBand
npm run dist
npm run create:fixtures
```

For a larger diagnostic gallery of every catalogue state:

```powershell
npm run create:fixtures -- --all
```

Verification performed during implementation:

- 38 tests passed, including all 255 byte occupancy masks, independent colours, NBT round trips, one-file Create export beyond 48 blocks, palette deduplication with differing entity materials, consumed-item accounting, thin geometry, negative coordinates, odd dimensions, impossible fits, and unstable stair replacement.
- The real assignment pipeline was tested with the bundled atlas. Every material in the Copycat-safe palette exists in that atlas.
- The browser imported the bundled skull, voxelised it to 32,062 voxels, assigned safe materials, and completed exact export to 11,031 block positions with dimensions 43 × 40 × 60 in about 0.43 seconds for the export job. The embedded browser did not expose the blob download event; the generated fixture files on disk were verified separately.
- **Minecraft placement, rotations/mirrors, chunk reload, and Schematicannon printing have not been executed here.** The in-game procedure above is the remaining compatibility acceptance test.


### Testing the preview

1. Run `npm start -- --port 8085`, open `http://127.0.0.1:8085`, and load `res/samples/skull.obj`.
2. Voxelise, then click **Preview Copycats** in Assign without assigning blocks. Expect solid-coloured fitted geometry and a console message with final block dimensions.
3. Enable **Copycat-safe materials** and click **Assign blocks**. The active Copycat preview should refresh with material textures.
4. Choose 4x, allow approximation, and click **Preview Copycats**. Inspect the changed silhouette and approximation count. Selecting exact fitting on an unrepresentable model should show an error and retain the regular source view instead of a stale fitted preview.
5. Return to 2x exact, preview and export **Create + Copycats+**. The preview and export console counts/dimensions should match.
6. Voxelise again while previewing. It should switch back to solid colours until blocks are assigned again. Loading another model must clear the old preview.

Automated checks: `npm test -- --runInBand` covers independent part colours, preview/export fit equivalence, source coordinate alignment, cropped texture coordinates, outward face winding, chunk indices, exact-fit errors and export material validation. `npm run build` and `npm run dist` check TypeScript and the browser bundle.


### Slopes and panel controls

In **Assign**, **Copycat slopes** adds slope, slope-layer and vertical-slope candidates. Choose 4x, 8x or 16x and **Allow approximation and report differences** to enable the toggle. Slopes are off by default; exact fitting and 2x mode always exclude them. The fitter chooses a slope only where it matches best, so enabling the option does not guarantee a slope in every model.

**Panels and thin layers** is on by default. It includes Create panels, half panels, byte panels, flat panes, boards, layers and all three half-layer families. These can form fine stepped contours for angles that a slope does not fit. Choose 16x input to resolve every 1/16-block position, including the 3/16-block panel thickness; 4x and 8x can approximate those details. Panels use the supported axis-aligned orientations, not arbitrary diagonal rotations. Each Minecraft cell still contains one legal block state with its supported parts.

Click **Preview Copycats** after changing these controls. Both preview and Create + Copycats+ export honour them. Slopes render with smooth planar faces in both solid-colour and textured previews. All facings, top/bottom halves and slope-layer heights are supported. The preview does not emulate the mod's optional enhanced texture seams or connected textures.


Smooth preview geometry follows the pinned Copycats+ [slope renderer](https://github.com/copycats-plus/copycats/blob/60923e001d931ccbc2c6b21b0e911a248375186f/common/src/main/java/com/copycatsplus/copycats/content/copycat/slope/CopycatSlopeModelCore.java), [slope-layer renderer](https://github.com/copycats-plus/copycats/blob/60923e001d931ccbc2c6b21b0e911a248375186f/common/src/main/java/com/copycatsplus/copycats/content/copycat/slope_layer/CopycatSlopeLayerModelCore.java), and [vertical-slope renderer](https://github.com/copycats-plus/copycats/blob/60923e001d931ccbc2c6b21b0e911a248375186f/common/src/main/java/com/copycatsplus/copycats/content/copycat/vertical_slope/CopycatVerticalSlopeModelCore.java). Tests cover closed surfaces, volume, outward normals and all 60 supported orientations/heights, plus solid/textured buffers and unchanged schematic serialization.
