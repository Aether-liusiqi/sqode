/**
 * Worker-preview bootstrap: the one module preview.html adds ahead of the
 * stock entry tag. The runtime's optional source stage owns the pre-Cordis
 * chooser; the unchanged Host connector then owns the Worker handshake.
 * Everything after those calls is the served startup chain verbatim.
 */
import SqhWorker from '@liusiqi-dev/sqh-experimental-webworker-runtime/worker?worker'
import {
  chooseWorkerHostSource, connectWorkerHost, IMAGE_FILE_NAME,
} from '@liusiqi-dev/sqh-experimental-webworker-runtime/client'

const image = `preview/${IMAGE_FILE_NAME}`
const source = await chooseWorkerHostSource({ image })
await connectWorkerHost(new SqhWorker({ name: 'sqhhost' }), { image, overlays: source.overlays })
