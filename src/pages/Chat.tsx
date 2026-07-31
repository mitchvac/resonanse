import { useParams } from 'react-router';

export default function Chat() {
  const { id } = useParams();
  return (
    <div className="flex h-full min-h-[100dvh] items-center justify-center md:min-h-0">
      <h1 className="t-heading" style={{ color: 'var(--text-ink)' }}>
        Chat {id}
      </h1>
    </div>
  );
}
