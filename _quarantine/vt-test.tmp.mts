import { serveVideo } from '/sessions/rcw-01nmp6cts4jyggqtqj38eu1v/mnt/aurum-gaming-platform/apps/api/src/services/videos.ts';
const key='a'.repeat(32)+'.mp4';
const mk=(range?:string)=>({ config:{uploadDir:'/tmp/vt'}, headers: range?{range}:{} } as any);
for (const r of [undefined,'bytes=0-99','bytes=4990-','bytes=-10','bytes=6000-']) {
  const rep:any = await serveVideo(mk(r), key);
  console.log(r, rep.status, rep.headers['content-range'], rep.headers['content-length']);
  rep.body?.destroy?.();
}
