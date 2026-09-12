/** Coordinates and cuboids use Minecraft's 16 pixels per block. Maxima are exclusive. */
export type Point = [number, number, number];
export type Box = [number, number, number, number, number, number];
export type Properties = Record<string, string>;
export interface ShapePart {
    key: string;
    boxes: Box[];
}
export interface CopycatShape {
    name: string;
    properties: Properties;
    parts: ShapePart[];
    entityId?: string;
    multi: boolean;
    volume: number;
    /** Curved/sloped surfaces are compared on the pixel grid, never claimed exact. */
    approximate?: boolean;
}
export interface MaterialVoxel {
    position: Point;
    material: string;
}
export interface FittedBlock {
    position: Point;
    shape: CopycatShape;
    materials: Record<string, string>;
}
export interface CopycatOptions {
    /** Input voxels per Minecraft block edge. 2 preserves arbitrary input exactly. */
    resolution: 2 | 4 | 8 | 16;
    /** Reject an export if the legal shapes cannot preserve geometry and materials. */
    strict: boolean;
    /** Consider slope, slope-layer and vertical-slope blocks in approximate 4x+ fitting. */
    includeSlopes?: boolean;
    /** Panels, panes, boards and thin-layer families are enabled unless explicitly disabled. */
    includePanels?: boolean;
}
export interface FitResult {
    size: Point;
    blocks: FittedBlock[];
    inputVoxels: number;
    approximatedBlocks: number;
    geometryErrorPixels: number;
    materialErrorPixels: number;
    blockCounts: Record<string, number>;
}
