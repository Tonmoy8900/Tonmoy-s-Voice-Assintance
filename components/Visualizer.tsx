
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface VisualizerProps {
  isActive: boolean;
  isAITalking: boolean;
  analyzer?: AnalyserNode;
  volume: number;
  brightness: number;
  battery: number;
  isSharingScreen: boolean;
  cpuUsage: number; // 0-100
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
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const filterId = 'organic-glow';
    const filter = defs.append('filter').attr('id', filterId);
    const feBlur = filter.append('feGaussianBlur').attr('result', 'blur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const group = svg.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    // Dynamic Color Palette based on Battery
    const getBatteryColors = (lvl: number) => {
      if (lvl > 50) return [['#4285F4', '#34A853'], ['#3498db', '#2980b9'], ['#00d2ff', '#3a7bd5']];
      if (lvl > 20) return [['#f1c40f', '#f39c12'], ['#e67e22', '#d35400'], ['#f39c12', '#e67e22']];
      return [['#e74c3c', '#c0392b'], ['#9b59b6', '#8e44ad'], ['#e91e63', '#ad1457']];
    };

    const colors = getBatteryColors(battery);
    
    // Create blobs with dynamic gradients
    const blobs = colors.map((c, i) => {
      const gradId = `grad-${i}-${battery}`;
      const grad = defs.append('radialGradient').attr('id', gradId);
      grad.append('stop').attr('offset', '0%').attr('stop-color', c[0]).attr('stop-opacity', 0.8);
      grad.append('stop').attr('offset', '100%').attr('stop-color', c[1]).attr('stop-opacity', 0);

      return group.append('path')
        .attr('fill', `url(#${gradId})`)
        .attr('filter', `url(#${filterId})`)
        .attr('opacity', 0.6)
        .attr('class', 'blob-path');
    });

    // Network Status Halo
    const networkHalo = group.append('circle')
      .attr('r', 220)
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('opacity', 0.2);

    // Vision Focus Ring
    const focusRing = group.append('circle')
      .attr('r', 100)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255,255,255,0.2)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '5,5')
      .style('display', isSharingScreen ? 'block' : 'none');

    let animationId: number;
    const line = d3.lineRadial().curve(d3.curveBasisClosed);
    const numPoints = isSharingScreen ? 24 : 16; 

    const render = () => {
      const time = Date.now() / 1000;
      let freqData = new Uint8Array(0);
      let intensity = 0;

      if (analyzer && isActive) {
        freqData = new Uint8Array(analyzer.frequencyBinCount);
        analyzer.getByteFrequencyData(freqData);
        intensity = d3.mean(freqData) || 0;
      }

      const volFactor = volume / 100;
      const brightFactor = brightness / 100;
      const cpuFactor = cpuUsage / 100;
      const baseRadius = 80 + (volFactor * 50);
      
      feBlur.attr('stdDeviation', 5 + (brightFactor * 30));

      // Network Halo Animation
      networkHalo
        .attr('stroke', isOnline ? '#00d2ff' : '#ff4b2b')
        .attr('stroke-dasharray', isOnline ? 'none' : '4,8')
        .attr('opacity', 0.1 + (Math.sin(time * 2) * 0.05))
        .attr('transform', `rotate(${time * 5})`);

      blobs.forEach((blob, i) => {
        const points: [number, number][] = [];
        const speed = (0.3 + i * 0.2) * (0.5 + brightFactor);
        const turbulence = volFactor * 40;
        
        for (let j = 0; j < numPoints; j++) {
          const angle = (j / numPoints) * Math.PI * 2;
          const freqVal = (freqData[j % freqData.length] || 0) / 255;
          
          const audioEffect = isActive ? (freqVal * 120 * (isAITalking ? 1.5 : 1)) : 0;
          
          // Organic hardware-driven wobble + CPU Jitter
          const cpuJitter = Math.sin(time * 50 + j * 10) * (cpuFactor * 15);
          const wobble = Math.sin(time * speed + j + i) * (turbulence + (isSharingScreen ? 20 : 0));
          
          const r = baseRadius + audioEffect + wobble + cpuJitter;
          points.push([angle, r]);
        }

        blob.attr('d', line(points));
        
        const rotation = time * (15 + i * 10) * (0.8 + volFactor);
        const scale = isActive ? 1.0 + (intensity / 300) : 0.9;
        blob.attr('transform', `rotate(${rotation}) scale(${scale})`);
        blob.attr('opacity', 0.3 + (brightFactor * 0.5));
      });

      if (isSharingScreen) {
        focusRing
          .attr('r', baseRadius + Math.sin(time * 5) * 10 + 20)
          .attr('transform', `rotate(${time * -20})`)
          .style('opacity', 0.2 + (volFactor * 0.3));
      }

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [isActive, isAITalking, analyzer, volume, brightness, battery, isSharingScreen, cpuUsage, isOnline]);

  return (
    <div className="relative flex items-center justify-center w-[500px] h-[500px]">
      <div 
        className={`absolute inset-0 rounded-full transition-all duration-1000 blur-[120px]`}
        style={{
          opacity: 0.15 + (brightness / 200),
          background: !isOnline ? '#ef4444' : (battery > 50 ? '#3b82f6' : (battery > 20 ? '#f59e0b' : '#ef4444')),
          transform: `scale(${0.8 + (volume / 200) + (cpuUsage / 500)})`
        }}
      ></div>
      
      <svg ref={svgRef} width="500" height="500" viewBox="0 0 500 500" className="z-10"></svg>
      
      <div className={`absolute w-32 h-32 rounded-full border border-white/5 transition-all duration-700 
        ${isActive ? 'scale-125 opacity-20' : 'scale-75 opacity-0'}`} 
        style={{ 
          boxShadow: `inset 0 0 40px ${battery > 50 ? '#3b82f6' : '#ef4444'}`,
          filter: `blur(${cpuUsage / 10}px)` 
        }}>
      </div>
    </div>
  );
};

export default Visualizer;
