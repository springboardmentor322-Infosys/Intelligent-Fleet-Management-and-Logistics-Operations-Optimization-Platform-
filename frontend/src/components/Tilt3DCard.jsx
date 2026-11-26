import React from 'react';

export default function Tilt3DCard({
  as: Tag = 'div',
  className = '',
  maxTilt,
  children,
  ...rest
}) {
  return (
    <Tag className={`tilt-3d-card ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
