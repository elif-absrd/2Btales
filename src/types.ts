export type PhotoFilter = 'autumn' | 'sepia' | 'faded' | 'moss';

export interface PhotoRecord {
  id: string;
  blob: Blob;
  createdAt: number;
  caption: string;
  filter: PhotoFilter;
  order: number;
  originalName?: string;
}

export interface PhotoView extends PhotoRecord {
  url: string;
}

export interface MetaRecord<T = unknown> {
  key: string;
  value: T;
}
