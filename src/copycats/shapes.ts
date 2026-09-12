import { Box, CopycatShape, Point, Properties, ShapePart } from './types';

// Profile: Copycats+ v3.0.9+mc1.21.1, CCShapes and the block classes.
// See docs/copycats-create.md for pinned sources and the supported families.
export const HORIZONTAL = ['south', 'west', 'north', 'east'] as const;
export const DIRECTIONS = [...HORIZONTAL, 'up', 'down'] as const;
export type Direction = typeof DIRECTIONS[number];
export const AXES = ['x', 'y', 'z'] as const;

export function rotate(p: Point, axis: number, turns: number): Point {
    let [x, y, z] = p;
    for (let i = 0; i < (turns % 4 + 4) % 4; i++) {
        if (axis === 0) [y, z] = [z, 16 - y];
        if (axis === 1) [x, z] = [16 - z, x];
        if (axis === 2) [x, y] = [y, 16 - x];
    }
    return [x, y, z];
}

export function transformBox(box: Box, transform: (p: Point) => Point): Box {
    const a = transform(box.slice(0, 3) as Point);
    const b = transform(box.slice(3) as Point);
    return [...a.map((v, i) => Math.min(v, b[i])), ...a.map((v, i) => Math.max(v, b[i]))] as Box;
}

function facing(p: Point, direction: Direction): Point {
    if (direction === 'up') return rotate(p, 0, 1);
    if (direction === 'down') return rotate(p, 0, -1);
    return rotate(p, 1, HORIZONTAL.indexOf(direction));
}

function alongAxis(p: Point, axis: string): Point {
    if (axis === 'y') return rotate(p, 0, 1);
    if (axis === 'x') return rotate(p, 1, -1);
    return p;
}

export const boxVolume = (b: Box) => (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
const part = (key: string, ...boxes: Box[]): ShapePart => ({key, boxes});
let cached: CopycatShape[] | undefined;

/** Finite legal shapes; never combine unrelated blocks in the same block position. */
export function getCopycatShapes(): CopycatShape[] {
    if (cached) return cached;
    const shapes: CopycatShape[] = [];
    const add = (name: string, properties: Properties, parts: ShapePart[], multi = false) => {
        const volume = parts.reduce((n, p) => n + p.boxes.reduce((v, b) => v + boxVolume(b), 0), 0);
        if (!volume) return;
        shapes.push({name, properties, parts: parts.filter((p) => p.boxes.some((b) => boxVolume(b) > 0)), multi, volume,
            entityId: name === '$material' ? undefined : multi ? 'copycats:multistate_copycat' : name.startsWith('create:') ? 'create:copycat' : 'copycats:copycat'});
    };
    const single = (name: string, props: Properties, boxes: Box[]) => add(name, {waterlogged: 'false', ...props}, [part('material', ...boxes)]);
    add('$material', {}, [part('material', [0, 0, 0, 16, 16, 16])]);
    add('copycats:copycat_block', {}, [part('material', [0, 0, 0, 16, 16, 16])]);

    // Arbitrary occupancy and independent colours in all eight half-block octants.
    const bytes: ShapePart[] = [];
    for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
            for (let x = 0; x < 2; x++) {
                bytes.push(part(`${y ? 'top' : 'bottom'}_${z ? 'south' : 'north'}${x ? 'east' : 'west'}`,
                    [x * 8, y * 8, z * 8, x * 8 + 8, y * 8 + 8, z * 8 + 8]));
            }
        }
    }
    for (let mask = 1; mask < 256; mask++) {
        const props: Properties = {waterlogged: 'false'};
        bytes.forEach((p, i) => props[p.key] = String(Boolean(mask & (1 << i))));
        add('copycats:copycat_byte', props, bytes.filter((_, i) => mask & (1 << i)), true);
    }

    for (const axis of AXES) {
        const orient = (b: Box) => transformBox(b, (p) => alongAxis(p, axis));
        single('copycats:copycat_beam', {axis}, [orient([4, 4, 0, 12, 12, 16])]);
        single('copycats:copycat_flat_pane', {axis}, [orient([0, 0, 7, 16, 16, 9])]);
        for (const type of ['bottom', 'top', 'double']) {
            add('copycats:copycat_slab', {axis, type, waterlogged: 'false'}, [
                ...(type !== 'top' ? [part('bottom', orient([0, 0, 0, 16, 16, 8]))] : []),
                ...(type !== 'bottom' ? [part('top', orient([0, 0, 8, 16, 16, 16]))] : []),
            ], true);
        }
    }

    for (const dir of DIRECTIONS) {
        const orient = (b: Box) => transformBox(b, (p) => facing(p, dir));
        // Create panels and Copycats+ layers face outwards. Byte/half panels use
        // the opposite convention: their facing points towards the support.
        single('create:copycat_panel', {facing: dir}, [orient([0, 0, 0, 16, 16, 3])]);
        for (let layers = 1; layers <= 8; layers++) {
            single('copycats:copycat_layer', {facing: dir, layers: String(layers)}, [orient([0, 0, 0, 16, 16, layers * 2])]);
        }
        for (const offset of HORIZONTAL) {
            let box = transformBox([0, 8, 13, 16, 16, 16], (p) => rotate(p, 2, -HORIZONTAL.indexOf(offset)));
            box = orient(box);
            if (dir === 'east' || dir === 'west') {
                box = transformBox(box, (p) => {
                    const q = rotate(p, 0, -1);
                    return [q[0], dir === 'west' ? 16 - q[1] : q[1], q[2]];
                });
            }
            if (dir === 'north') box = transformBox(box, ([x, y, z]) => [16 - x, y, z]);
            if (dir === 'up') box = transformBox(box, ([x, y, z]) => [x, y, 16 - z]);
            single('copycats:copycat_half_panel', {facing: dir, offset}, [box]);
        }
        const horizontal: Record<Direction, [number, boolean]> = {south: [0, true], north: [0, false], east: [2, false], west: [2, true], up: [0, true], down: [0, true]};
        const vertical: [number, boolean] = dir === 'down' ? [2, true] : dir === 'up' ? [2, false] : [1, true];
        const normal = dir === 'up' || dir === 'down' ? 1 : dir === 'east' || dir === 'west' ? 0 : 2;
        const quadrants: ShapePart[] = [];
        for (let v = 0; v < 2; v++) {
            for (let h = 0; h < 2; h++) {
                const min: Point = [0, 0, 0];
                const size: Point = [8, 8, 8];
                min[horizontal[dir][0]] = (horizontal[dir][1] ? h : 1 - h) * 8;
                min[vertical[0]] = (vertical[1] ? v : 1 - v) * 8;
                min[normal] = ['south', 'east', 'up'].includes(dir) ? 13 : 0;
                size[normal] = 3;
                quadrants.push(part(`${v ? 'top' : 'bottom'}_${h ? 'left' : 'right'}`, [...min, ...min.map((a, i) => a + size[i])] as Box));
            }
        }
        for (let mask = 1; mask < 16; mask++) {
            const props: Properties = {facing: dir, waterlogged: 'false'};
            quadrants.forEach((p, i) => props[p.key] = String(Boolean(mask & (1 << i))));
            add('copycats:copycat_byte_panel', props, quadrants.filter((_, i) => mask & (1 << i)), true);
        }
    }

    // Multi-face boards, including the box and catwalk combinations. Trim overlapping
    // edges in the fitting representation so union volume is counted exactly once.
    for (let mask = 1; mask < 64; mask++) {
        const props: Properties = {waterlogged: 'false'};
        const parts: ShapePart[] = [];
        const low: Point = [0, 0, 0];
        const high: Point = [16, 16, 16];
        const faces = ['west', 'east', 'down', 'up', 'north', 'south'];
        faces.forEach((face, i) => {
            props[face] = String(Boolean(mask & (1 << i)));
            if (!(mask & (1 << i))) return;
            const axis = Math.floor(i / 2);
            const a = [...low] as Point;
            const b = [...high] as Point;
            if (i % 2) { a[axis] = 15; high[axis] = 15; } else { b[axis] = 1; low[axis] = 1; }
            parts.push(part(face, [...a, ...b] as Box));
        });
        add('copycats:copycat_board', props, parts, true);
    }

    for (const dir of HORIZONTAL) {
        const orient = (b: Box, top = false) => transformBox(b, (p) => {
            const q = facing(p, dir);
            return [q[0], top ? 16 - q[1] : q[1], q[2]];
        });
        single('copycats:copycat_vertical_step', {facing: dir}, [orient([8, 0, 8, 16, 16, 16])]);
        for (let layers = 1; layers <= 8; layers++) {
            const n = layers * 2;
            single('copycats:copycat_vertical_slice', {facing: dir, layers: String(layers)}, [orient([16 - n, 0, 16 - n, 16, 16, 16])]);
        }
        for (const half of ['bottom', 'top']) {
            const top = half === 'top';
            const props = {facing: dir, half};
            // Pixel-centre samples of the rendered planar slopes, not collision stair steps.
            for (let layers = 1; layers <= 7; layers++) {
                const low = layers <= 4 ? 0 : (layers - 4) * 4;
                const high = layers <= 4 ? layers * 4 : 16;
                const boxes: Box[] = [];
                for (let z = 0; z < 16; z++) {
                    const height = Math.round(low + (high - low) * (z + 0.5) / 16);
                    if (height) boxes.push(orient([0, 0, z, 16, height, z + 1], top));
                }
                single(layers === 4 ? 'copycats:copycat_slope' : 'copycats:copycat_slope_layer',
                    layers === 4 ? props : {...props, layers: String(layers)}, boxes);
                shapes[shapes.length - 1].approximate = true;
            }
            single('create:copycat_step', props, [orient([0, 0, 8, 16, 8, 16], top)]);
            for (let layers = 1; layers <= 8; layers++) {
                const n = layers * 2;
                single('copycats:copycat_slice', {...props, layers: String(layers)}, [orient([0, 0, 16 - n, 16, n, 16], top)]);
                single('copycats:copycat_corner_slice', {...props, layers: String(layers)}, [orient([16 - n, 0, 16 - n, 16, n, 16], top)]);
            }
            // Straight and both inner/outer stair corners, with disjoint boxes.
            for (const shape of ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right']) {
                const boxes: Box[] = [[0, 0, 0, 16, 8, 16]];
                if (!shape.startsWith('outer')) boxes.push([0, 8, 8, 16, 16, 16]);
                if (shape === 'inner_left') boxes.push([8, 8, 0, 16, 16, 8]);
                if (shape === 'inner_right') boxes.push([0, 8, 0, 8, 16, 8]);
                if (shape === 'outer_left') boxes.push([8, 8, 8, 16, 16, 16]);
                if (shape === 'outer_right') boxes.push([0, 8, 8, 8, 16, 16]);
                single('copycats:copycat_stairs', {...props, shape}, boxes.map((b) => orient(b, top)));
            }
        }
        const verticalSlope: Box[] = [];
        for (let z = 0; z < 16; z++) verticalSlope.push(orient([15 - z, 0, z, 16, 16, z + 1]));
        single('copycats:copycat_vertical_slope', {facing: dir}, verticalSlope);
        shapes[shapes.length - 1].approximate = true;
        for (const side of ['left', 'right']) {
            for (const shape of ['straight', 'outer_top', 'outer_bottom', 'inner_top', 'inner_bottom']) {
                const boxes: Box[] = [[0, 0, 8, 16, 16, 16], [8, 0, 0, 16, shape.startsWith('outer') ? 8 : 16, 8]];
                if (shape.startsWith('inner')) boxes.push([0, 0, 0, 8, 8, 8]);
                single('copycats:copycat_vertical_stairs', {facing: dir, side, shape}, boxes.map((b) => orient(
                    transformBox(b, ([x, y, z]) => [side === 'right' ? 16 - x : x, y, z]), shape.endsWith('top'))));
            }
        }
        for (let negative = 0; negative <= 8; negative++) {
            for (let positive = 0; positive <= 8; positive++) {
                const props = {facing: dir, negative_layers: String(negative), positive_layers: String(positive), waterlogged: 'false'};
                add('copycats:copycat_vertical_half_layer', props, [
                    part('negative_layers', orient([0, 0, 16 - negative * 2, 8, 16, 16])),
                    part('positive_layers', orient([8, 0, 16 - positive * 2, 16, 16, 16])),
                ], true);
                add('copycats:copycat_stacked_half_layer', props, [
                    part('negative_layers', orient([0, 0, 16 - negative * 2, 16, 8, 16])),
                    part('positive_layers', orient([0, 8, 16 - positive * 2, 16, 16, 16])),
                ], true);
            }
        }
    }
    for (const axis of ['x', 'z']) {
        for (const half of ['bottom', 'top']) {
            for (let negative = 0; negative <= 8; negative++) {
                for (let positive = 0; positive <= 8; positive++) {
                    const orient = (b: Box) => transformBox(b, (p) => {
                        const q = alongAxis(p, axis);
                        return [q[0], half === 'top' ? 16 - q[1] : q[1], q[2]];
                    });
                    add('copycats:copycat_half_layer', {axis, half, negative_layers: String(negative), positive_layers: String(positive), waterlogged: 'false'}, [
                        part('negative_layers', orient([0, 0, 0, 16, negative * 2, 8])),
                        part('positive_layers', orient([0, 0, 8, 16, positive * 2, 16])),
                    ], true);
                }
            }
        }
    }
    cached = shapes;
    return shapes;
}

/** Thin construction shapes used for stepped surfaces and shallow contours. */
export function isPanelShape(shape: CopycatShape): boolean {
    return ['create:copycat_panel', 'copycats:copycat_half_panel', 'copycats:copycat_byte_panel',
        'copycats:copycat_flat_pane', 'copycats:copycat_board', 'copycats:copycat_layer',
        'copycats:copycat_half_layer', 'copycats:copycat_vertical_half_layer',
        'copycats:copycat_stacked_half_layer'].includes(shape.name);
}
