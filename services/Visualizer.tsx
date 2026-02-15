
import React, { useEffect, useRef } from 'react';
// Use namespace import for D3 to fix "no exported member" errors in TypeScript environments
import * as d3 from 'd3';

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

    const width = 600;
    const height = 600;
    // Fix: Use d3.select instead of direct select
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    
    // Core glow filter
    const filter = defs.append('filter').attr('id', 'core-glow');
    filter.append('feGaussianBlur').attr('stdDeviation', 12).attr('result', 'blur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const group = svg.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    // Orbital Rings
    const rings = [160, 185, 210].map((radius, i) => {
        return group.append('circle')
            .attr('r', radius)
            .attr('fill', 'none')
            .attr('stroke', i === 1 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', i === 1 ? '5, 15' : '2, 10');
    });

    // Satellites
    const satellites = [0, 1, 2].map(i => {
        return group.append('circle')
            .attr('r', 3)
            .attr('fill', i === 0 ? '#3b82f6' : '#10b981')
            .attr('opacity', 0.6);
    });

    const colors = [
      ['#3b82f6', '#1d4ed8'], 
      ['#6366f1', '#4338ca'], 
      ['#22d3ee', '#0891b2']  
    ];
    
    const blobs = colors.map((c, i) => {
      const gradId = `grad-${i}`;
      const grad = defs.append('radialGradient').attr('id', gradId);
      grad.append('stop').attr('offset', '10%').attr('stop-color', c[0]).attr('stop-opacity', 0.6);
      grad.append('stop').attr('offset', '90%').attr('stop-color', c[1]).attr('stop-opacity', 0);

      return group.append('path')
        .attr('fill', `url(#${gradId})`)
        .attr('filter', 'url(#core-glow)')
        .attr('opacity', 0.7);
    });

    let animationId: number;
    // Fix: Use d3 namespace for lineRadial and curveBasisClosed
    const line = d3.lineRadial<[number, number]>().curve(d3.curveBasisClosed);
    const numPoints = 24;

    const render = () => {
      const time = Date.now() / 1000;
      let freqData = new Uint8Array(0);
      let intensity = 0;

      if (analyzer && isActive) {
        freqData = new Uint8Array(analyzer.frequencyBinCount);
        analyzer.getByteFrequencyData(freqData);
        // Fix: Use d3.mean instead of direct mean
        intensity = d3.mean(freqData) || 0;
      }

      const baseRadius = 110 + (intensity * 0.7);
      
      // Update Satellites
      satellites.forEach((sat, i) => {
          const angle = time * (0.5 + i * 0.2) + (i * Math.PI * 2 / 3);
          const r = 185 + Math.sin(time + i) * 10;
          sat.attr('cx', Math.cos(angle) * r)
             .attr('cy', Math.sin(angle) * r)
             .attr('opacity', isActive ? 0.8 : 0.1);
      });

      // Update Rings
      rings.forEach((ring, i) => {
          ring.attr('transform', `rotate(${time * (i === 1 ? -10 : 5)})`);
          ring.attr('opacity', isActive ? 0.4 : 0.05);
      });

      blobs.forEach((blob, i) => {
        const points: [number, number][] = [];
        const speed = (0.2 + i * 0.1);
        
        for (let j = 0; j < numPoints; j++) {
          const angle = (j / numPoints) * Math.PI * 2;
          const freqVal = (freqData[j % 24] || 0) / 255;
          
          const audioEffect = isActive ? (freqVal * 120 * (isAITalking ? 1.8 : 0.8)) : 0;
          const pulse = Math.sin(time * speed + j * 0.5 + i) * (20 + (intensity * 0.1));
          
          const r = baseRadius + audioEffect + pulse;
          points.push([angle, r]);
        }

        blob.attr('d', line(points));
        const rotation = time * (10 + i * 5);
        const scale = isActive ? 1.0 + (intensity / 500) : 0.85;
        blob.attr('transform', `rotate(${rotation}) scale(${scale})`);
        blob.attr('opacity', isActive ? 0.8 : 0.1);
      });

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [isActive, isAITalking, analyzer]);

  return (
    <div className="relative flex items-center justify-center w-[600px] h-[600px]">
      <div 
        className="absolute inset-0 rounded-full transition-all duration-1000 blur-[200px]"
        style={{
          opacity: isActive ? 0.25 : 0.05,
          background: isAITalking ? '#3b82f6' : '#1e1b4b',
          transform: `scale(${isActive ? 1.3 : 0.7})`
        }}
      ></div>
      <svg ref={svgRef} width="600" height="600" viewBox="0 0 600 600" className="z-10"></svg>
    </div>
  );
};

export default Visualizer;
