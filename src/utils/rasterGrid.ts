/** Packed occupancy rows for the nesting broad phase. Coordinates are cells. */
export class RasterGrid {
  private readonly stride: number;
  private readonly words: Uint32Array;
  constructor(readonly columns: number, readonly rows: number) {
    this.stride=Math.ceil(columns/32);
    this.words=new Uint32Array(this.stride*rows);
  }
  fill(row: number, left: number, right: number): void {
    if (row<0 || row>=this.rows) return;
    left=Math.max(0,left);right=Math.min(this.columns-1,right);
    if (left>right) return;
    const first=left>>>5,last=right>>>5,base=row*this.stride;
    for (let word=first;word<=last;word++) {
      const lo=word===first ? left&31 : 0,hi=word===last ? right&31 : 31;
      this.words[base+word]|=(0xffffffff<<lo)&(0xffffffff>>>(31-hi));
    }
  }
  /** Rightmost occupied cell in the inclusive range; -1 means clear. */
  lastOccupied(row: number, left: number, right: number): number {
    if (row<0 || row>=this.rows) return -1;
    left=Math.max(0,left);right=Math.min(this.columns-1,right);
    if (left>right) return -1;
    const first=left>>>5,last=right>>>5,base=row*this.stride;
    for (let word=last;word>=first;word--) {
      const lo=word===first ? left&31 : 0,hi=word===last ? right&31 : 31;
      const bits=this.words[base+word]&(0xffffffff<<lo)&(0xffffffff>>>(31-hi));
      if (bits) return word*32+31-Math.clz32(bits);
    }
    return -1;
  }
}
