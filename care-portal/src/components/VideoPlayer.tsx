type Props = {
  src: string;
  title: string;
};

export default function VideoPlayer({ src, title }: Props) {
  return (
    <video
      key={src}
      src={src}
      controls
      playsInline
      preload="metadata"
      className="w-full aspect-video bg-black"
      title={title}
    >
      お使いのブラウザは動画再生に対応していません
    </video>
  );
}
