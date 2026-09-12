import { COPYCAT_MATERIALS } from '../../res/palettes/copycat';
import { getCopycatShapes, isPanelShape } from './shapes';
import { Box, CopycatOptions, CopycatShape, FitResult, MaterialVoxel, Point } from './types';

const pixelIndex = (x: number, y: number, z: number) => x + 16 * (y + 16 * z);
const prefixIndex = (x: number, y: number, z: number) => x + 17 * (y + 17 * z);

/** A summed-volume table makes each candidate cuboid comparison constant time. */
function occupancyPrefix(pixels: Uint32Array): Uint16Array {
    const prefix = new Uint16Array(17 * 17 * 17);
    for (let z = 1; z <= 16; z++) {
        for (let y = 1; y <= 16; y++) {
            for (let x = 1; x <= 16; x++) {
                const at = (a: number, b: number, c: number) => prefix[prefixIndex(a, b, c)];
                prefix[prefixIndex(x, y, z)] = Number(pixels[pixelIndex(x - 1, y - 1, z - 1)] !== 0) +
            at(x - 1, y, z) + at(x, y - 1, z) + at(x, y, z - 1) -
            at(x - 1, y - 1, z) - at(x - 1, y, z - 1) - at(x, y - 1, z - 1) + at(x - 1, y - 1, z - 1);
            }
        }
    }
    return prefix;
}

function sumBox(prefix: Uint16Array, b: Box): number {
    const [x, y, z, X, Y, Z] = b;
    const at = (a: number, c: number, d: number) => prefix[prefixIndex(a, c, d)];
    return at(X, Y, Z) - at(x, Y, Z) - at(X, y, Z) - at(X, Y, z) +
        at(x, y, Z) + at(x, Y, z) + at(X, y, z) - at(x, y, z);
}

interface CellFit {
    shape: CopycatShape;
    materials: Record<string, string>;
    geometryError: number;
    materialError: number;
}

function expandSamples(samples: Uint32Array, r: number): Uint32Array {
    const pixels = new Uint32Array(4096);
    const scale = 16 / r;
    for (let z = 0; z < 16; z++) {
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                pixels[pixelIndex(x, y, z)] = samples[Math.floor(x / scale) + r * (Math.floor(y / scale) + r * Math.floor(z / scale))];
            }
        }
    }
    return pixels;
}

function fitCell(pixels: Uint32Array, names: string[], candidates: CopycatShape[]): CellFit {
    const prefix = occupancyPrefix(pixels);
    const occupied = prefix[prefixIndex(16, 16, 16)];
    let geometryError = Infinity;
    const finalists: CopycatShape[] = [];
    for (const shape of candidates) {
        if (Math.abs(shape.volume - occupied) > geometryError) continue;
        let intersection = 0;
        for (const p of shape.parts) for (const box of p.boxes) intersection += sumBox(prefix, box);
        const error = occupied + shape.volume - 2 * intersection;
        if (error < geometryError) { geometryError = error; finalists.length = 0; }
        if (error === geometryError) finalists.push(shape);
    }
    const overall = new Map<number, number>();
    pixels.forEach((id) => { if (id) overall.set(id, (overall.get(id) ?? 0) + 1); });
    const dominant = (counts: Map<number, number>) => Array.from(counts).sort((a, b) => b[1] - a[1] || names[a[0]].localeCompare(names[b[0]]))[0];
    const fallback = dominant(overall)[0];
    let best: CellFit | undefined;
    // Geometry first, material fidelity second, fewest independently skinned parts third.
    for (const shape of finalists) {
        let materialError = 0;
        const materials: Record<string, string> = {};
        for (const p of shape.parts) {
            const counts = new Map<number, number>();
            let occupiedPart = 0;
            for (const [x, y, z, X, Y, Z] of p.boxes) {
                for (let c = z; c < Z; c++) {
                    for (let b = y; b < Y; b++) {
                        for (let a = x; a < X; a++) {
                            const id = pixels[pixelIndex(a, b, c)];
                            if (id) { counts.set(id, (counts.get(id) ?? 0) + 1); occupiedPart++; }
                        }
                    }
                }
            }
            const winner = dominant(counts);
            materials[p.key] = names[winner ? winner[0] : fallback];
            materialError += occupiedPart - (winner ? winner[1] : 0);
        }
        if (!best || materialError < best.materialError ||
            (materialError === best.materialError && shape.parts.length < best.shape.parts.length)) {
            best = {shape, materials, geometryError, materialError};
        }
    }
    if (!best) throw new Error('No enabled copycat shapes can represent this cell.');
    return best;
}

export function packCopycats(voxels: MaterialVoxel[], options: CopycatOptions, progress?: (fraction: number) => void): FitResult {
    for (const voxel of voxels) {
        if (!COPYCAT_MATERIALS.has(voxel.material)) {
            throw new Error(`Unsupported copycat material: ${voxel.material}. Enable Copycat-safe materials in Assign and assign again.`);
        }
    }
    return fitCopycatVoxels(voxels, options, progress);
}

/** Shared geometry fitter; preview colours are opaque material keys, never export IDs. */
export function fitCopycatVoxels(voxels: MaterialVoxel[], options: CopycatOptions, progress?: (fraction: number) => void): FitResult {
    const r = options.resolution;
    if (![2, 4, 8, 16].includes(r)) throw new Error('Copycat resolution must be 2, 4, 8 or 16.');
    if (!voxels.length) throw new Error('Cannot export an empty mesh.');
    const min: Point = [Infinity, Infinity, Infinity];
    const max: Point = [-Infinity, -Infinity, -Infinity];
    const names = [''];
    const ids = new Map<string, number>();
    for (const voxel of voxels) {
        voxel.position.forEach((v, i) => {
            if (!Number.isSafeInteger(v)) throw new Error('Copycat input positions must be finite integer voxel coordinates.');
            min[i] = Math.min(min[i], v); max[i] = Math.max(max[i], v);
        });
        if (!ids.has(voxel.material)) { ids.set(voxel.material, names.length); names.push(voxel.material); }
    }
    // Align the minimum input voxel to the local schematic origin, including negative input coordinates.
    const cells = new Map<string, {position: Point, samples: Uint32Array}>();
    if (max.some((v, i) => Math.ceil((v - min[i] + 1) / r) > 2147483647)) {
        throw new Error('Copycat structure dimensions exceed the NBT integer limit.');
    }
    for (const voxel of voxels) {
        const local = voxel.position.map((v, i) => v - min[i]);
        const position = local.map((v) => Math.floor(v / r)) as Point;
        const key = position.join(',');
        let cell = cells.get(key);
        if (!cell) { cell = {position, samples: new Uint32Array(r * r * r)}; cells.set(key, cell); }
        const [x, y, z] = local.map((v) => v % r);
        const index = x + r * (y + r * z);
        if (cell.samples[index]) throw new Error(`Duplicate input voxel at ${voxel.position.join(',')}.`);
        cell.samples[index] = ids.get(voxel.material)!;
    }
    // Half-block mode uses only aligned geometry, so there are no sub-grid surprises.
    // Corner stairs require specific neighbours. Keep those states in the catalogue
    // for diagnostics, but use independent shapes when automatically fitting corners.
    const candidates = getCopycatShapes().filter((s) => (options.includePanels !== false || !isPanelShape(s)) && (!s.properties.shape || s.properties.shape === 'straight') && (!s.approximate || (options.includeSlopes === true && !options.strict)) &&
        (r !== 2 || s.parts.every((p) => p.boxes.every((b) => b.every((n) => n % 8 === 0)))));
    const result: FitResult = {size: max.map((v, i) => Math.ceil((v - min[i] + 1) / r)) as Point,
        blocks: [], inputVoxels: voxels.length, approximatedBlocks: 0, geometryErrorPixels: 0, materialErrorPixels: 0, blockCounts: {}};
    const fitCache = new Map<string, CellFit>();
    const fitted = new Map<string, {position: Point, fit: CellFit}>();
    let completed = 0;
    for (const cell of Array.from(cells.values()).sort((a, b) => a.position[1] - b.position[1] || a.position[2] - b.position[2] || a.position[0] - b.position[0])) {
        const key = cell.samples.join(',');
        let fit = fitCache.get(key);
        if (!fit) {
            fit = fitCell(expandSamples(cell.samples, r), names, candidates);
            // Bound cache growth for detailed meshes with mostly unique colours.
            if (fitCache.size < 2048) fitCache.set(key, fit);
        }
        fitted.set(cell.position.join(','), {position: cell.position, fit});
        progress?.(++completed / cells.size * 0.9);
    }
    // Adjacent perpendicular stairs can change shape after Minecraft neighbour
    // updates. Refit both participants with independent blocks (bytes always work
    // at 2x). This conservative check also covers vertical stairs' top/bottom joins.
    const unstable = new Set<string>();
    for (const [key, {position, fit}] of Array.from(fitted.entries())) {
        if (!fit.shape.name.endsWith('_stairs')) continue;
        for (let axis = 0; axis < 3; axis++) {
            for (const sign of [-1, 1]) {
                const adjacent = [...position]; adjacent[axis] += sign;
                const neighbour = fitted.get(adjacent.join(','));
                if (neighbour?.fit.shape.name.endsWith('_stairs') &&
                JSON.stringify(neighbour.fit.shape.properties) !== JSON.stringify(fit.shape.properties)) {
                    unstable.add(key); unstable.add(adjacent.join(','));
                }
            }
        }
    }
    const independent = candidates.filter((s) => !s.name.endsWith('_stairs'));
    unstable.forEach((key) => {
        fitted.get(key)!.fit = fitCell(expandSamples(cells.get(key)!.samples, r), names, independent);
    });
    for (const {position, fit} of Array.from(fitted.values())) {
        if (fit.geometryError || fit.materialError || fit.shape.approximate) {
            result.approximatedBlocks++;
            if (options.strict) throw new Error(`Copycat shapes cannot exactly represent cell ${position.join(',')} at ${r} voxels/block. Use 2x mode or allow approximation.`);
        }
        result.geometryErrorPixels += fit.geometryError;
        result.materialErrorPixels += fit.materialError;
        result.blocks.push({position, shape: fit.shape, materials: fit.materials});
        const name = fit.shape.name === '$material' ? fit.materials.material : fit.shape.name;
        result.blockCounts[name] = (result.blockCounts[name] ?? 0) + 1;
    }
    progress?.(1);
    return result;
}
