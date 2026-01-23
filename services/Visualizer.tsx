
import React, { useEffect, useRef } from 'react';
// Use named imports to resolve D3 type issues where properties might not be found on the default export
import { select, mean, lineRadial, curveBasisClosed } from 'd3';

interface VisualizerProps {
  isActive: boolean;
  isAITalking: boolean;
  analyzer?: AnalyserNode;
  volume: number;
  brightness: number;
  battery: number;
  isSharingScreen: boolean;
  cpuUsage: number;
  isOnline: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ 
  isActive, 
  isAITalking, 
  analyzer, 
  volume, 
  brightness, 
  battery,
  isSharingScreen,
  cpuUsage,
  isOnline
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 500;
    const height = 500;
    // Use named 'select' instead of 'd3.select'
    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const filterId = 'global-glow';
    const filter = defs.append('filter').attr('id', filterId);
    filter.append('feGaussianBlur').attr('stdDeviation', 12).attr('result', 'blur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const group = svg.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    // Global Style Color Palette (Sophisticated Deep Blues & Indigos)
    const colors = [
      ['#2563eb', '#1e40af'], // Primary Blue
      ['#4f46e5', '#3730a3'], // Indigo
      ['#0ea5e9', '#0369a1']  // Sky
    ];
    
    const blobs = colors.map((c, i) => {
      const gradId = `grad-${i}`;
      const grad = defs.append('radialGradient').attr('id', gradId);
      grad.append('stop').attr('offset', '0%').attr('stop-color', c[0]).attr('stop-opacity', 0.4);
      grad.append('stop').attr('offset', '100%').attr('stop-color', c[1]).attr('stop-opacity', 0);

      return group.append('path')
        .attr('fill', `url(#${gradId})`)
        .attr('filter', `url(#${filterId})`)
        .attr('opacity', 0.5);
    });

    let animationId: number;
    // Use named 'lineRadial' and 'curveBasisClosed'
    const line = lineRadial<[number, number]>().curve(curveBasisClosed);
    const numPoints = 18;

    const render = () => {
      const time = Date.now() / 1000;
      let freqData = new Uint8Array(0);
      let intensity = 0;

      if (analyzer && isActive) {
        freqData = new Uint8Array(analyzer.frequencyBinCount);
        analyzer.getByteFrequencyData(freqData);
        // Use named 'mean' instead of 'd3.mean'
        intensity = mean(freqData) || 0;
      }

      const volFactor = volume / 100;
      const baseRadius = 120 + (intensity * 0.8);
      
      blobs.forEach((blob, i) => {
        const points: [number, number][] = [];
        const speed = (0.2 + i * 0.1);
        
        for (let j = 0; j < numPoints; j++) {
          const angle = (j / numPoints) * Math.PI * 2;
          const freqVal = (freqData[j % 32] || 0) / 255;
          
          const audioEffect = isActive ? (freqVal * 80 * (isAITalking ? 1.4 : 1)) : 0;
          const wobble = Math.sin(time * speed + j * 0.5 + i) * (20 + (volFactor * 30));
          
          const r = baseRadius + audioEffect + wobble;
          points.push([angle, r]);
        }

        blob.attr('d', line(points));
        const rotation = time * (10 + i * 5);
        const scale = isActive ? 1.0 + (intensity / 500) : 0.95;
        blob.attr('transform', `rotate(${rotation}) scale(${scale})`);
        blob.attr('opacity', isActive ? 0.6 : 0.2);
      });

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [isActive, isAITalking, analyzer, volume, brightness, battery, isSharingScreen, cpuUsage, isOnline]);

  return (
    <div className="relative flex items-center justify-center w-[500px] h-[500px]">
      <div 
        className="absolute inset-0 rounded-full transition-all duration-1000 blur-[150px]"
        style={{
          opacity: 0.2 + (brightness / 200),
          background: isActive ? '#3b82f6' : '#111',
          transform: `scale(${isActive ? 1.1 : 0.9})`
        }}
      ></div>
      <svg ref={svgRef} width="500" height="500" viewBox="0 0 500 500" className="z-10"></svg>
    </div>
  );
};

export default Visualizer;
