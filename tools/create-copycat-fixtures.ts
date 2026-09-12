import fs from 'fs';
import path from 'path';

import { packCopycats } from '../src/copycats/packer';
import { getCopycatShapes } from '../src/copycats/shapes';
import { writeCreateStructure } from '../src/copycats/structure';
import { CopycatShape, FitResult, MaterialVoxel, Point } from '../src/copycats/types';

// Generates actual Create files without needing an imported model or Minecraft.
const directory = path.resolve(__dirname, '../examples/create');
fs.mkdirSync(directory, {recursive: true});
const colours = ['red', 'orange', 'yellow', 'lime', 'cyan', 'blue', 'purple', 'white'].map((c) => `minecraft:${c}_concrete`);
const byteVoxels: MaterialVoxel[] = colours.map((material, i) => ({position: [i & 1, (i >> 2) & 1, (i >> 1) & 1] as Point, material}));
const byteResult = packCopycats(byteVoxels, {resolution: 2, strict: true});
fs.writeFileSync(path.join(directory, 'copycat-byte-colours.nbt'), writeCreateStructure(byteResult));

const byFamily = new Map<string, CopycatShape[]>();
getCopycatShapes().forEach((shape) => {
    if (shape.name === '$material') return;
    const list = byFamily.get(shape.name) ?? [];
    list.push(shape); byFamily.set(shape.name, list);
});

function gallery(filename: string, shapes: CopycatShape[]) {
    const columns = Math.ceil(Math.sqrt(shapes.length));
    const result: FitResult = {size: [columns * 3, 2, Math.ceil(shapes.length / columns) * 3], blocks: [],
        inputVoxels: 0, approximatedBlocks: 0, geometryErrorPixels: 0, materialErrorPixels: 0, blockCounts: {}};
    const legend: object[] = [];
    shapes.forEach((shape, i) => {
        const position: Point = [(i % columns) * 3, 1, Math.floor(i / columns) * 3];
        const materials = Object.fromEntries(shape.parts.map((part, j) => [part.key, colours[j % colours.length]]));
        result.blocks.push({position, shape, materials});
        result.blocks.push({position: [position[0], 0, position[2]],
            shape: {name: '$material', properties: {}, parts: [], multi: false, volume: 4096}, materials: {material: 'minecraft:stone'}});
        legend.push({position, block: shape.name, properties: shape.properties, materials});
    });
    fs.writeFileSync(path.join(directory, `${filename}.nbt`), writeCreateStructure(result));
    fs.writeFileSync(path.join(directory, `${filename}.json`), JSON.stringify({size: result.size, blocks: legend}, null, 2) + '\n');
}

// A compact gallery with three different states per family. No neighbour-sensitive
// corner stair states: those can only persist beside matching stairs in Minecraft.
const showcase: CopycatShape[] = [];
byFamily.forEach((all) => {
    const family = all.filter((s) => !s.properties.shape || s.properties.shape === 'straight');
    const examples = new Set([family[0], family[Math.floor(family.length / 2)], family[family.length - 1]]);
    examples.forEach((shape) => showcase.push(shape));
});
gallery('copycat-showcase', showcase);
if (process.argv.includes('--all')) gallery('copycat-all-states', getCopycatShapes().filter((s) => s.name !== '$material'));
console.log(`Wrote Create .nbt test files to ${directory}. ${byFamily.size} copycat block families; ${getCopycatShapes().length} candidate states.`);
