import RNFetchBlob from '../index.js'
import Log from '../utils/log.js'
import fs from '../fs'
import unicode from '../utils/unicode'
import Blob from './Blob'

const log = new Log('FetchPolyfill')

log.disable()
// log.level(3)

export default class Fetch {

  constructor(config:RNFetchBlobConfig) {
    Object.assign(this, new RNFetchBlobFetchPolyfill(config))
  }

}

class RNFetchBlobFetchPolyfill {

  constructor(config:RNFetchBlobConfig) {
    this.build = () => (url, options = {}) => {

      let body = options.body
      let promise = Promise.resolve()
      let blobCache = null

      options.headers = options.headers || {}
      let ctype = options['Content-Type'] || options['content-type']
      let ctypeH = options.headers['Content-Type'] || options.headers['content-type']
      options.headers['Content-Type'] = ctype || ctypeH
      options.headers['content-type'] = ctype || ctypeH
      options.method = options.method || 'GET'

      if(body) {
        // When the request body is an instance of FormData, create a Blob cache
        // to upload the body.
        if(body instanceof FormData) {
          log.verbose('convert FormData to blob body')
          promise = Blob.build(body).then((b) => {
            blobCache = b
            options.headers['Content-Type'] = 'multipart/form-data;boundary=' + b.multipartBoundary
            return Promise.resolve(RNFetchBlob.wrap(b._ref))
          })
        }
        // When request body is a Blob, use file URI of the Blob as request body.
        else if (body.isRNFetchBlobPolyfill)
          promise = Promise.resolve(RNFetchBlob.wrap(body.blobPath))
        // send it as-is, leave the native module decide how to send the body.
        else
          promise = Promise.resolve(body)
      }

      // task is a progress reportable and cancellable Promise, however,
      // task.then is not, so we have to extend task.then with progress and
      // cancel function
      let task = promise
          .then((body) => {
            return RNFetchBlob.config(config)
            .fetch(options.method, url, options.headers, body)
          })

      let statefulPromise = task.then((resp) => {
        log.verbose('response', resp)
        // release blob cache created when sending request
        if(blobCache !== null && blobCache instanceof Blob)
          blobCache.close()
        return Promise.resolve(new RNFetchBlobFetchRepsonse(resp))
      })

      // extend task.then progress with report and cancelling functions
      statefulPromise.cancel = task.cancel
      statefulPromise.progress = task.progress
      statefulPromise.uploadProgress = task.uploadProgress

      return statefulPromise

    }
  }

}

class RNFetchBlobFetchRepsonse {

  constructor(resp:FetchBlobResponse) {
    let info = resp.info()
    this.headers = info.headers
    this.ok = info.status >= 200 && info.status <= 299,
    this.status = info.status
    this.type = 'basic'
    this.bodyUsed = false
    this.resp = resp
    this.rnfbRespInfo = info
    this.rnfbResp = resp
  }

  arrayBuffer(){
    log.verbose('to arrayBuffer', this.rnfbRespInfo)
    return readArrayBuffer(this.rnfbResp, this.rnfbRespInfo)
  }

  text() {
    log.verbose('to text', this.rnfbResp, this.rnfbRespInfo)
    return readText(this.rnfbResp, this.rnfbRespInfo)
  }

  json() {
    log.verbose('to json', this.rnfbResp, this.rnfbRespInfo)
    return readJSON(this.rnfbResp, this.rnfbRespInfo)
  }

  blob() {
    log.verbose('to blob', this.rnfbResp, this.rnfbRespInfo)
    return readBlob(this.rnfbResp, this.rnfbRespInfo)
  }
}

/**
 * Get response data as array.
 * @param  {FetchBlobResponse} resp Response data object from RNFB fetch call.
 * @param  {RNFetchBlobResponseInfo} info Response informations.
 * @return {Promise<Array>}
 */
function readArrayBuffer(resp, info):Promise<Array> {
  switch (info.rnfbEncode) {
    case 'path':
      return resp.readFile('ascii')
      break
    default:
      let buffer = []
      let str = resp.text()
      for (let i in str) {
        buffer[i] = str.charCodeAt(i);
      }
      return Promise.resolve(buffer)
      break
  }
}

/**
 * Get response data as string.
 * @param  {FetchBlobResponse} resp Response data object from RNFB fetch call.
 * @param  {RNFetchBlobResponseInfo} info Response informations.
 * @return {Promise<string>}
 */
function readText(resp, info):Promise<string> {
  switch (info.rnfbEncode) {
    case 'base64':
      return Promise.resolve(resp.text())
      break
    case 'path':
      return resp.text()
      break
    default:
      return Promise.resolve(resp.text())
      break
  }
}


/**
 * Get response data as RNFetchBlob Blob polyfill object.
 * @param  {FetchBlobResponse} resp Response data object from RNFB fetch call.
 * @param  {RNFetchBlobResponseInfo} info Response informations.
 * @return {Promise<Blob>}
 */
function readBlob(resp, info):Promise<Blob> {
  log.verbose('readBlob', resp, info)
  return resp.blob()
}

/**
 * Get response data as JSON object.
 * @param  {FetchBlobResponse} resp Response data object from RNFB fetch call.
 * @param  {RNFetchBlobResponseInfo} info Response informations.
 * @return {Promise<object>}
 */
function readJSON(resp, info):Promise<object> {
  log.verbose('readJSON', resp, info)
  switch (info.rnfbEncode) {
    case 'base64':
      return Promise.resolve(resp.json())
    case 'path':
      return resp.json()
    default:
      return Promise.resolve(resp.json())
  }
}
