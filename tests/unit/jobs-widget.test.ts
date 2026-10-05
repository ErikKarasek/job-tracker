import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chunkLoaderPath, chunkNames, jobsWidgetAdId, widgetConfig } from '../../server/scout/jobs-widget.ts'

test('a posting on an employer Jobs.cz site is recognised by its redirected URL', () => {
  assert.equal(jobsWidgetAdId('https://csg.jobs.cz/detail-pozice?r=detail&id=1634646597&rps=0&impressionId='), '1634646597')
  assert.equal(jobsWidgetAdId('https://www.jobs.cz/rpd/1634646597/'), null)
  assert.equal(jobsWidgetAdId('https://example.com/detail-pozice?id=1'), null)
})

test('the bundle loader and its chunks are read off the shell page', () => {
  const html = '<script src="/assets/js/react.min.js?av=47ee30080e26267c" id="react-chunks" defer></script>'
  assert.equal(chunkLoaderPath(html), '/assets/js/react.min.js?av=47ee30080e26267c')
  const loader = '!function(){var e=["react.50e0a46e.react.min.js","react.49d0a293.react.min.js"],t=document.getElementById("react-chunks")}'
  assert.deepEqual(chunkNames(loader), ['react.50e0a46e.react.min.js', 'react.49d0a293.react.min.js'])
})

test('the widget id and key come from the site config chunk', () => {
  const js =
    '"errorPages":{},"widgets":{"main":{"id":"1acb0649-b614-48ca-943b-8b85d72774a2","apiKey":"cba1494b0ac4b05cc7d44032ea6d09205dbe8f87a2a9963ada60b135e32d5224","pagePath":""}}'
  assert.deepEqual(widgetConfig(js), {
    id: '1acb0649-b614-48ca-943b-8b85d72774a2',
    apiKey: 'cba1494b0ac4b05cc7d44032ea6d09205dbe8f87a2a9963ada60b135e32d5224',
  })
  assert.equal(widgetConfig('var a=1'), null)
})
