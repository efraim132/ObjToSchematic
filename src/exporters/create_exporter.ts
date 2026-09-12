import { BlockMesh } from '../block_mesh';
import { packCopycats } from '../copycats/packer';
import { writeCreateStructure } from '../copycats/structure';
import { CopycatOptions, FitResult } from '../copycats/types';
import { LOC, TLocalisedString } from '../localiser';
import { ProgressManager } from '../progress';
import { StatusHandler } from '../status';
import { AppError } from '../util/error_util';
import { IExporter, TStructureExport } from './base_exporter';

export class CreateExporter extends IExporter {
    public constructor(private readonly options?: CopycatOptions) { super(); }

    public override getFormatFilter() { return {name: 'Create schematic (Minecraft 1.21.1)', extension: 'nbt'}; }

    public override export(blockMesh: BlockMesh): TStructureExport {
        const task = ProgressManager.Get.start('Exporting');
        try {
            const voxels = blockMesh.getBlocks().map((b) => ({position: b.voxel.position.toArray() as [number, number, number], material: b.blockInfo.name}));
            let result: FitResult;
            if (this.options) {
                result = packCopycats(voxels, this.options, (fraction) => ProgressManager.Get.progress(task, fraction));
                StatusHandler.info(LOC('export.copycat_result', {input: result.inputVoxels, count: result.blocks.length, size: result.size.join(' × '), resolution: this.options.resolution}));
                if (result.approximatedBlocks) StatusHandler.warning(LOC('export.copycat_approximation', {count: result.approximatedBlocks, geometry: result.geometryErrorPixels, material: result.materialErrorPixels}));
            } else {
                if (!voxels.length) throw new Error('Cannot export an empty mesh.');
                const min = [Infinity, Infinity, Infinity];
                const max = [-Infinity, -Infinity, -Infinity];
                voxels.forEach((v) => v.position.forEach((n, i) => { min[i] = Math.min(min[i], n); max[i] = Math.max(max[i], n); }));
                result = {size: max.map((n, i) => n - min[i] + 1) as [number, number, number],
                    blocks: voxels.map((v) => ({position: v.position.map((n, i) => n - min[i]) as [number, number, number],
                        shape: {name: '$material', properties: {}, parts: [], multi: false, volume: 4096}, materials: {material: v.material}})),
                    inputVoxels: voxels.length, approximatedBlocks: 0, geometryErrorPixels: 0, materialErrorPixels: 0, blockCounts: {}};
            }
            return {type: 'single', extension: '.nbt', content: writeCreateStructure(result)};
        } catch (error) {
            throw new AppError((error instanceof Error ? error.message : String(error)) as TLocalisedString);
        } finally {
            ProgressManager.Get.end(task);
        }
    }
}

