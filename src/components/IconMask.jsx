export default function IconMask({ src, className = '', style, ...props }) {
  return (
    <span
      className={`icon-mask${className ? ` ${className}` : ''}`}
      style={{ '--icon-url': `url("${src}")`, ...style }}
      aria-hidden="true"
      {...props}
    />
  );
}
