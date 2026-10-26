import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";

type FocusCallback = () => void | (() => void);

export function useStableFocusEffect(callback: FocusCallback) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useFocusEffect(useCallback(() => callbackRef.current(), []));
}
