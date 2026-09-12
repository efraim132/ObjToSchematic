import type { TAtlasBlock } from '../atlas';
import type { TBlockMeshBufferDescription } from '../buffer';
import type { RGBA } from '../colour';
import { fitCopycatVoxels, packCopycats } from './packer';
import { getSlopeFaces } from './slope_geometry';
import { CopycatOptions, FitResult, Point } from './types';

export interface PreviewVoxel { position: Point; colour: RGBA; material?: string }

/** Fit exactly the same material cells as export, or provisional solid colours. */
export function fitCopycatPreview(voxels: PreviewVoxel[], options: CopycatOptions) {
    const textured = voxels.length > 0 && voxels.every((v) => v.material !== undefined);
    const colours = new Map<string, RGBA>();
    const samples = voxels.map((v) => {
        const key = textured ? v.material! : [v.colour.r, v.colour.g, v.colour.b, v.colour.a].join(',');
        colours.set(key, v.colour);
        return {position: v.position, material: key};
    });
    const fit = (textured ? packCopycats : fitCopycatVoxels)(samples, options);
    const origin: Point = [Infinity, Infinity, Infinity];
    voxels.forEach((v) => v.position.forEach((n, axis) => { origin[axis] = Math.min(origin[axis], n); }));
    return {fit, colours, origin, textured};
}

// Counterclockwise vertices viewed from outside; UVs crop a full block texture.
const faces = [
    {name: 'west', normal: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], uv: [2,1]},
    {name: 'east', normal: [1, 0, 0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], uv: [2,1]},
    {name: 'down', normal: [0, -1, 0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], uv: [0,2]},
    {name: 'up', normal: [0, 1, 0], corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], uv: [0,2]},
    {name: 'north', normal: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], uv: [0,1]},
    {name: 'south', normal: [0, 0, 1], corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]], uv: [0,1]},
] as const;

/** Bounded GPU chunks in source-voxel coordinates keep camera framing stable. */
export function createCopycatPreviewBuffers(fit: FitResult, resolution: number, origin: Point,
    colours: Map<string, RGBA>, atlas?: Map<string, TAtlasBlock>, boxesPerChunk = 2048): TBlockMeshBufferDescription[] {
    if (!Number.isInteger(boxesPerChunk) || boxesPerChunk < 1) throw new Error('Invalid preview chunk size.');
    const chunks: TBlockMeshBufferDescription[] = [];
    let position: number[] = [], normal: number[] = [], colour: number[] = [], texcoord: number[] = [];
    let blockTexcoord: number[] = [], blockPosition: number[] = [], indices: number[] = [];
    let boxes = 0;
    const flush = () => {
        if (!boxes) return;
        const vertices = position.length / 3;
        chunks.push({numElements: indices.length, buffer: {
            position: {numComponents: 3, data: new Float32Array(position)},
            normal: {numComponents: 3, data: new Float32Array(normal)},
            colour: {numComponents: 4, data: new Float32Array(colour)},
            texcoord: {numComponents: 2, data: new Float32Array(texcoord)},
            blockTexcoord: {numComponents: 2, data: new Float32Array(blockTexcoord)},
            blockPosition: {numComponents: 3, data: new Float32Array(blockPosition)},
            occlusion: {numComponents: 4, data: new Float32Array(vertices * 4).fill(1)},
            lighting: {numComponents: 1, data: new Float32Array(vertices).fill(1)},
            indices: {numComponents: 3, data: new Uint32Array(indices)},
        }});
        position = []; normal = []; colour = []; texcoord = []; blockTexcoord = []; blockPosition = []; indices = []; boxes = 0;
    };
    for (const block of fit.blocks) {
        const slopeFaces = getSlopeFaces(block.shape);
        for (const part of block.shape.parts) {
            const material = block.materials[part.key];
            const skin = atlas?.get(material);
            const tint = colours.get(material) ?? {r: 0.8, g: 0.8, b: 0.8, a: 1};
            if (slopeFaces) {
                for (const face of slopeFaces) {
                    const first = position.length / 3;
                    const uv = skin?.faces[face.textureFace].texcoord;
                    for (const vertex of face.vertices) {
                        const local = vertex.map((n) => n / 16);
                        position.push(...local.map((n, axis) => origin[axis] - 0.5 + (block.position[axis] + n) * resolution));
                        normal.push(...face.normal);
                        colour.push(tint.r, tint.g, tint.b, tint.a);
                        texcoord.push(local[face.uvAxes[0]], 1 - local[face.uvAxes[1]]);
                        blockTexcoord.push(uv?.u ?? 0, uv?.v ?? 0);
                        blockPosition.push(...block.position);
                    }
                    for (let i = 1; i < face.vertices.length - 1; i++) indices.push(first, first + i, first + i + 1);
                }
                if (++boxes >= boxesPerChunk) flush();
                continue;
            }
            for (const box of part.boxes) {
                for (const face of faces) {
                    const first = position.length / 3;
                    const uv = skin?.faces[face.name].texcoord;
                    for (const corner of face.corners) {
                        const local = corner.map((high, axis) => box[axis + (high ? 3 : 0)] / 16);
                        position.push(...local.map((n, axis) => origin[axis] - 0.5 + (block.position[axis] + n) * resolution));
                        normal.push(...face.normal);
                        colour.push(tint.r, tint.g, tint.b, tint.a);
                        texcoord.push(local[face.uv[0]], 1 - local[face.uv[1]]);
                        blockTexcoord.push(uv?.u ?? 0, uv?.v ?? 0);
                        blockPosition.push(...block.position);
                    }
                    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
                }
                if (++boxes >= boxesPerChunk) flush();
            }
        }
    }
    flush();
    return chunks;
}
