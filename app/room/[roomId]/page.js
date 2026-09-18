import WatchRoom from '@/components/WatchRoom';

export default async function RoomPage({ params, searchParams }) {
  const { roomId } = await params;
  const query = await searchParams;
  const initialName = typeof query?.name === 'string' ? query.name.slice(0, 30) : '';
  return <WatchRoom roomId={roomId} initialName={initialName} />;
}
