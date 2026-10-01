import { createContext, useContext, useState, ReactNode } from 'react';
export type Photo = { uri: string; width: number; height: number };
const Context = createContext<{ photos: Photo[]; add: (photo: Photo) => void; remove: (uri: string) => void } | null>(null);
export function PhotosProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  return <Context.Provider value={{ photos, add: photo => setPhotos(old => old.some(p => p.uri === photo.uri) ? old : [...old, photo]), remove: uri => setPhotos(old => old.filter(p => p.uri !== uri)) }}>{children}</Context.Provider>;
}
export function usePhotos() { const value = useContext(Context); if (!value) throw new Error('PhotosProvider missing'); return value; }
