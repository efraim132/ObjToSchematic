import { Atlas } from '../src/atlas';
import { createCopycatPreviewBuffers } from '../src/copycats/preview';
import { getCopycatShapes } from '../src/copycats/shapes';
import { getSlopeFaces } from '../src/copycats/slope_geometry';
import { writeCreateStructure } from '../src/copycats/structure';
import { FitResult } from '../src/copycats/types';

const slopes = getCopycatShapes().filter((shape) => shape.approximate);

test('every slope orientation is a closed planar solid with outward unit normals and correct volume', () => {
    expect(slopes.length).toBe(60);
    for (const shape of slopes) {
        const faces = getSlopeFaces(shape)!;
        const layer = shape.properties.layers ? Number(shape.properties.layers) : 4;
        const low = layer <= 4 ? 0 : (layer - 4) * 4;
        const high = layer <= 4 ? layer * 4 : 16;
        expect(faces.length).toBe(low ? 6 : 5);
        expect(faces.filter((f) => f.normal.filter((n) => Math.abs(n) > 1e-6).length === 2)).toHaveLength(1);
        const edgeCounts = new Map<string, number>();
        let volume = 0;
        for (const face of faces) {
            expect(Math.hypot(...face.normal)).toBeCloseTo(1);
            for (let i = 0; i < face.vertices.length; i++) {
                const a = face.vertices[i], b = face.vertices[(i + 1) % face.vertices.length];
                const edge = [a.join(','), b.join(',')].sort().join('|');
                edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
                a.forEach((n) => { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(16); });
                expect(a.reduce((sum, n, axis) => sum + (n - face.vertices[0][axis]) * face.normal[axis], 0)).toBeCloseTo(0);
            }
            for (let i = 1; i < face.vertices.length - 1; i++) {
                const [a,b,c] = [face.vertices[0], face.vertices[i], face.vertices[i + 1]];
                volume += (a[0]*(b[1]*c[2]-b[2]*c[1]) + a[1]*(b[2]*c[0]-b[0]*c[2]) + a[2]*(b[0]*c[1]-b[1]*c[0])) / 6;
            }
        }
        expect(Array.from(edgeCounts.values()).every((n) => n === 2)).toBe(true);
        expect(volume).toBeCloseTo(16 * 16 * (low + high) / 2);
    }
});

test('slope direction and top-half reflection follow the exported block properties', () => {
    const shape = slopes.find((s) => s.name === 'copycats:copycat_slope' && s.properties.facing === 'south' && s.properties.half === 'bottom')!;
    const ramp = getSlopeFaces(shape)!.find((f) => f.normal.filter((n) => n !== 0).length === 2)!;
    expect(ramp.vertices.every(([x,y,z]) => y === z)).toBe(true);
    expect(ramp.normal[1]).toBeGreaterThan(0);
    expect(ramp.normal[2]).toBeLessThan(0);
    const flipped = getSlopeFaces({...shape, properties: {...shape.properties, half: 'top'}})!;
    const ceiling = flipped.find((f) => f.normal.filter((n) => n !== 0).length === 2)!;
    expect(ceiling.vertices.every(([x,y,z]) => y === 16 - z)).toBe(true);
    expect(ceiling.normal[1]).toBeLessThan(0);
    const vertical = getSlopeFaces(slopes.find((s) => s.name === 'copycats:copycat_vertical_slope' && s.properties.facing === 'south')!)!;
    const wall = vertical.find((f) => f.normal.filter((n) => n !== 0).length === 2)!;
    expect(wall.vertices.every(([x,y,z]) => x === 16 - z)).toBe(true);
    expect(wall.normal[0]).toBeLessThan(0);
});

test('smooth GPU geometry works with colours and textures and leaves export data unchanged', () => {
    const shape = slopes[0];
    const fit: FitResult = {size: [1,1,1], blocks: [{position: [0,0,0], shape, materials: {material: 'minecraft:stone'}}],
        inputVoxels: 1, approximatedBlocks: 1, geometryErrorPixels: 0, materialErrorPixels: 0, blockCounts: {[shape.name]: 1}};
    const before = writeCreateStructure(fit);
    const colours = new Map([['minecraft:stone', {r: 0.25, g: 0.5, b: 0.75, a: 1}]]);
    for (const atlas of [undefined, Atlas.getVanillaAtlas()!.getBlocks()]) {
        const chunks = createCopycatPreviewBuffers(fit, 16, [0,0,0], colours, atlas, 1);
        expect(chunks).toHaveLength(1);
        const {buffer, numElements} = chunks[0];
        expect(numElements).toBe(24); // two triangular ends, three quads: no pixel stair treads
        expect(buffer.position.data.length / 3).toBe(18);
        expect(Array.from(buffer.colour.data.slice(0,4))).toEqual([0.25,0.5,0.75,1]);
        expect(Array.from(buffer.texcoord.data).every((n) => n >= 0 && n <= 1)).toBe(true);
        expect(Array.from(buffer.normal.data).some((n) => Math.abs(n) > 0 && Math.abs(n) < 1)).toBe(true);
        expect(Math.max(...Array.from(buffer.indices.data))).toBeLessThan(18);
        if (atlas) expect(buffer.blockTexcoord.data.some((n) => n > 0)).toBe(true);
    }
    expect(writeCreateStructure(fit).equals(before)).toBe(true);
});
