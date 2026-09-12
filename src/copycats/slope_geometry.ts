import { HORIZONTAL, rotate } from './shapes';
import { CopycatShape, Point } from './types';

type FaceName = 'west' | 'east' | 'down' | 'up' | 'north' | 'south';
export interface SlopeFace {
    /** Counterclockwise polygon in the block's 0..16 coordinate space. */
    vertices: Point[];
    normal: Point;
    textureFace: FaceName;
    uvAxes: readonly [number, number];
}

const cubeFaces: {name: FaceName; normal: Point; vertices: Point[]; uv: readonly [number, number]}[] = [
    {name: 'west', normal: [-1,0,0], vertices: [[0,0,16],[0,16,16],[0,16,0],[0,0,0]], uv: [2,1]},
    {name: 'east', normal: [1,0,0], vertices: [[16,0,0],[16,16,0],[16,16,16],[16,0,16]], uv: [2,1]},
    {name: 'down', normal: [0,-1,0], vertices: [[0,0,0],[16,0,0],[16,0,16],[0,0,16]], uv: [0,2]},
    {name: 'up', normal: [0,1,0], vertices: [[0,16,16],[16,16,16],[16,16,0],[0,16,0]], uv: [0,2]},
    {name: 'north', normal: [0,0,-1], vertices: [[0,0,0],[0,16,0],[16,16,0],[16,0,0]], uv: [0,1]},
    {name: 'south', normal: [0,0,1], vertices: [[16,0,16],[16,16,16],[0,16,16],[0,0,16]], uv: [0,1]},
];

/** Continuous geometry from Copycats+ 3.0.9's three slope ModelCore classes.
 * The fitter keeps its pixel samples; only rendering uses these planar faces.
 */
export function getSlopeFaces(shape: CopycatShape): SlopeFace[] | undefined {
    if (!['copycats:copycat_slope', 'copycats:copycat_slope_layer', 'copycats:copycat_vertical_slope'].includes(shape.name)) return;
    const layer = shape.name === 'copycats:copycat_slope_layer' ? Number(shape.properties.layers) : 4;
    const low = layer <= 4 ? 0 : (layer - 4) * 4;
    const high = layer <= 4 ? layer * 4 : 16;
    const vertical = shape.name === 'copycats:copycat_vertical_slope';
    const flipped = !vertical && shape.properties.half === 'top';
    const turns = HORIZONTAL.indexOf(shape.properties.facing as typeof HORIZONTAL[number]);
    const transform = (p: Point): Point => {
        let q = vertical ? rotate(p, 2, -1) : p;
        q = rotate(q, 1, turns);
        return flipped ? [q[0], 16 - q[1], q[2]] : q;
    };
    const base = transform([0,0,0]);
    const result: SlopeFace[] = [];
    for (const face of cubeFaces) {
        // Collapsing the low edge turns the end quads into triangles, and removes
        // the zero-area front face. Never send degenerate triangles to the GPU.
        const vertices = face.vertices.map(([x,y,z]) => transform([x, y / 16 * (low + (high - low) * z / 16), z]))
            .filter((p, i, all) => all.findIndex((q) => q.every((v, axis) => v === p[axis])) === i);
        if (vertices.length < 3) continue;
        if (flipped) vertices.reverse();
        const u = vertices[1].map((v, axis) => v - vertices[0][axis]);
        const v = vertices[2].map((n, axis) => n - vertices[0][axis]);
        const cross: Point = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
        const length = Math.hypot(...cross);
        if (!length) continue;
        const normal = cross.map((n) => n / length) as Point;
        const mapped = transform(face.normal).map((n, axis) => n - base[axis]);
        const skinFace = cubeFaces.find((f) => f.normal.every((n, axis) => n === mapped[axis]))!;
        result.push({vertices, normal, textureFace: skinFace.name, uvAxes: skinFace.uv});
    }
    return result;
}
