import { QRCodeSVG } from 'qrcode.react';
import { useRef } from 'react';

interface QRCodeDisplayProps {
  url: string;
  tournamentName: string;
}

export default function QRCodeDisplay({ url, tournamentName }: QRCodeDisplayProps) {
  const svgRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    if (!svgRef.current) return;
    const svg = svgRef.current.querySelector('svg');
    if (!svg) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = 400;
      canvas.height = 400;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 400, 400);
      ctx.drawImage(img, 0, 0, 400, 400);
      URL.revokeObjectURL(svgUrl);

      const a = document.createElement('a');
      a.download = `${tournamentName}_QR.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = svgUrl;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div ref={svgRef} className="bg-white p-4 rounded-xl">
        <QRCodeSVG value={url} size={256} />
      </div>
      <p className="text-sm text-slate-400 break-all">{url}</p>
      <button
        onClick={handleDownload}
        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
      >
        QRコードをダウンロード
      </button>
    </div>
  );
}
