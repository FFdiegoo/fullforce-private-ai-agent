import React, { useEffect, useState } from 'react';

interface UploadNotificationProps {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
  onClose?: () => void;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  }>;
}

export default function UploadNotification({
  type,
  title,
  message,
  duration = 5000,
  onClose,
  actions
}: UploadNotificationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      return undefined; // Explicitly return void
    }
  }, [duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 300);
  };

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          container: 'bg-green-50 border-green-200',
          icon: '✅',
          iconBg: 'bg-green-100 text-green-600',
          title: 'text-green-800',
          message: 'text-green-700'
        };
      case 'error':
        return {
          container: 'bg-red-50 border-red-200',
          icon: '❌',
          iconBg: 'bg-red-100 text-red-600',
          title: 'text-red-800',
          message: 'text-red-700'
        };
      case 'warning':
        return {
          container: 'bg-yellow-50 border-yellow-200',
          icon: '⚠️',
          iconBg: 'bg-yellow-100 text-yellow-600',
          title: 'text-yellow-800',
          message: 'text-yellow-700'
        };
      case 'info':
      default:
        return {
          container: 'bg-blue-50 border-blue-200',
          icon: 'ℹ️',
          iconBg: 'bg-blue-100 text-blue-600',
          title: 'text-blue-800',
          message: 'text-blue-700'
        };
    }
  };

  if (!isVisible) return null;

  const styles = getTypeStyles();

  return (
    <div className={`
      fixed top-4 right-4 z-50 max-w-sm w-full transform transition-all duration-300 ease-in-out
      ${isLeaving ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
    `}>
      <div className={`
        border rounded-xl shadow-lg p-4 ${styles.container}
      `}>
        <div className="flex items-start">
          <div className={`
            flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3
            ${styles.iconBg}
          `}>
            <span className="text-sm">{styles.icon}</span>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium ${styles.title} mb-1`}>
              {title}
            </div>
            <div className={`text-sm ${styles.message} mb-3`}>
              {message}
            </div>
            
            {/* Actions */}
            {actions && actions.length > 0 && (
              <div className="flex space-x-2">
                {actions.map((action, index) => (
                  <button
                    key={index}
                    onClick={action.onClick}
                    className={`
                      px-3 py-1 text-xs font-medium rounded-lg transition-colors
                      ${action.variant === 'primary'
                        ? `${type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                            type === 'error' ? 'bg-red-600 hover:bg-red-700' :
                            type === 'warning' ? 'bg-yellow-600 hover:bg-yellow-700' :
                            'bg-blue-600 hover:bg-blue-700'
                          } text-white`
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }
                    `}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Close Button */}
          <button
            onClick={handleClose}
            className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}