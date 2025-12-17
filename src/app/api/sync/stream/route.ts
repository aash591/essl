import { NextRequest } from "next/server";
import { syncManager } from "@/lib/syncManager";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/sync/stream
 * Stream sync progress using Server-Sent Events
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const searchParams = req.nextUrl.searchParams;
  const resumeOnly = searchParams.get('resume') === 'true';

  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (data: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          // Controller might be closed
        }
      };

      const currentState = syncManager.getState();

      if (resumeOnly) {
        if (!currentState.isSyncing) {
          sendProgress({ phase: 'idle', message: 'Not syncing' });
          controller.close();
          return;
        }
      } else {
        // Only start legacy single-sync if NOT already syncing
        if (!currentState.isSyncing) {
          // Start sync but don't await - it runs in background
          syncManager.startSync().catch(err => {
            console.error("Error starting sync:", err);
          });
          // Give sync a moment to initialize state
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }

      // Send initial state after sync has started
      const initialState = syncManager.getState();
      // Force send initial state even if empty to ensure UI updates
      sendProgress({
          progress: initialState.progress || 0,
          message: initialState.message || 'Starting sync...',
          phase: initialState.phase || 'init',
          isMultiDevice: initialState.isMultiDevice || false,
          currentDeviceIndex: initialState.currentDeviceIndex || 0,
          totalDevices: initialState.totalDevices || 0,
          currentDeviceName: initialState.currentDeviceName || '',
          deviceResults: initialState.deviceResults || [],
          results: initialState.results || null
      });

      const unsubscribe = syncManager.subscribe((state) => {
        const payload: any = {
          progress: state.progress,
          message: state.message,
          phase: state.phase,
          status: state.status,
          isMultiDevice: state.isMultiDevice,
          currentDeviceIndex: state.currentDeviceIndex,
          totalDevices: state.totalDevices,
          currentDeviceName: state.currentDeviceName,
          deviceResults: state.deviceResults,
          results: state.results
        };

        if (state.phase === 'complete') {
          payload.result = state.results;
        }

        if (state.phase === 'error') {
          payload.error = state.error;
        }

        sendProgress(payload);

        // Close stream when sync completes (phase 'complete' or 'users' with status 'complete' and not syncing)
        if ((state.phase === 'complete' || state.phase === 'error' || 
             (state.phase === 'users' && state.status === 'complete')) && state.isSyncing === false) {
          setTimeout(() => {
            try {
              unsubscribe();
              controller.close();
            } catch (e) { }
          }, 100);
        }
      });

      req.signal.addEventListener('abort', () => {
        unsubscribe();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
