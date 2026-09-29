"use client";

import { useEffect, useState } from "react";
import { MapPin, AlertCircle, Loader2 } from "lucide-react";

interface Location {
  lat: number;
  lng: number;
}

interface LocationDetectorProps {
  onLocationDetected: (location: Location) => void;
  onError: (error: string) => void;
}

export function LocationDetector({
  onLocationDetected,
  onError,
}: LocationDetectorProps) {
  const [status, setStatus] = useState<
    "detecting" | "success" | "error" | "denied"
  >("detecting");

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus("error");
      onError("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setStatus("success");
        onLocationDetected(location);
      },
      (error) => {
        setStatus("denied");
        if (error.code === error.PERMISSION_DENIED) {
          onError("Location permission denied. Please enable location access.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          onError("Location information unavailable.");
        } else {
          onError("Failed to detect location.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [onLocationDetected, onError]);

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
      {status === "detecting" && (
        <>
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span className="text-sm">Detecting location...</span>
        </>
      )}
      {status === "success" && (
        <>
          <MapPin className="w-5 h-5 text-green-600" />
          <span className="text-sm text-green-600 font-medium">
            Location detected
          </span>
        </>
      )}
      {(status === "error" || status === "denied") && (
        <>
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm text-red-600">Location access denied</span>
        </>
      )}
    </div>
  );
}
