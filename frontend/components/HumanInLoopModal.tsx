"use client";

import { useState, useEffect } from "react";
import { X, AlertCircle, Check, Clock } from "lucide-react";

interface ConfirmationRequest {
  id: string;
  stepName: string;
  stepDescription: string;
  details: {
    agentName: string;
    estimatedCost: number;
    conditionResult?: string;
    input?: Record<string, unknown> | string | number | boolean | null;
  };
  timeoutAt: number;
}

interface HumanInLoopModalProps {
  request: ConfirmationRequest | null;
  onConfirm: () => void;
  onReject: () => void;
  onClose: () => void;
}

export function HumanInLoopModal({
  request,
  onConfirm,
  onReject,
  onClose,
}: HumanInLoopModalProps) {
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!request) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const timeout = request.timeoutAt;
      const remaining = Math.max(0, Math.floor((timeout - now) / 1000));

      setTimeLeft(remaining);

      if (remaining === 0) {
        setIsExpired(true);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [request]);

  if (!request) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <AlertCircle className="text-amber-600" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Action Required</h3>
                <p className="text-sm text-gray-500">{request.stepName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Timer */}
          <div
            className={`flex items-center gap-2 p-3 rounded-lg ${
              timeLeft < 60
                ? "bg-red-50 text-red-700"
                : "bg-blue-50 text-blue-700"
            }`}
          >
            <Clock size={18} />
            <span className="font-medium">
              {isExpired
                ? "Timeout - Task will be cancelled"
                : `Time remaining: ${formatTime(timeLeft)}`}
            </span>
          </div>

          {/* Description */}
          <p className="text-gray-700">{request.stepDescription}</p>

          {/* Details */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Agent</span>
              <span className="font-medium">{request.details.agentName}</span>
            </div>

            {request.details.conditionResult && (
              <div className="flex justify-between">
                <span className="text-gray-600">Condition Result</span>
                <span
                  className={`font-medium ${
                    request.details.conditionResult.includes("✓")
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {request.details.conditionResult}
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-gray-600">Estimated Cost</span>
              <span className="font-medium">
                ${request.details.estimatedCost}
              </span>
            </div>

            {request.details.input && (
              <div className="pt-2 border-t">
                <span className="text-gray-600 text-sm">Input Data:</span>
                <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                  {JSON.stringify(request.details.input as Record<string, unknown>, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <p>
              This action will execute a blockchain transaction. Please review
              carefully before confirming.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t flex gap-3">
          <button
            onClick={onReject}
            disabled={isExpired}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Cancel Task
          </button>
          <button
            onClick={onConfirm}
            disabled={isExpired}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            <Check size={18} />
            Confirm & Continue
          </button>
        </div>
      </div>
    </div>
  );
}
