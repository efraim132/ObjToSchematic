import { IExporter } from './base_exporter';
import { CreateExporter } from './create_exporter';
import { IndexedJSONExporter } from './indexed_json_exporter ';
import { Litematic } from './litematic_exporter';
import { NBTExporter } from './nbt_exporter';
import { SchemExporter } from './schem_exporter';
import { Schematic } from './schematic_exporter';
import { UncompressedJSONExporter } from './uncompressed_json_exporter';

export type TExporters =
    'schematic' |
    'litematic' |
    'schem' |
    'nbt' |
    'create' |
    'create_copycats' |
    'uncompressed_json' |
    'indexed_json';

export class ExporterFactory {
    public static GetExporter(voxeliser: TExporters, copycatOptions?: import('../copycats/types').CopycatOptions): IExporter {
        switch (voxeliser) {
            case 'schematic':
                return new Schematic();
            case 'litematic':
                return new Litematic();
            case 'schem':
                return new SchemExporter();
            case 'nbt':
                return new NBTExporter();
            case 'create':
                return new CreateExporter();
            case 'create_copycats':
                return new CreateExporter(copycatOptions ?? {resolution: 2, strict: true});
            case 'uncompressed_json':
                return new UncompressedJSONExporter();
            case 'indexed_json':
                return new IndexedJSONExporter();
        }
    }
}
