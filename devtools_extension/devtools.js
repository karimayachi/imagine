// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The function below is executed in the context of the inspected page.
var page_getProperties = function () {
    if(!window.__debug_imagine) {
        let message = { error: 'No Imagine or Imagine not bound in debug mode' };
        message.__proto__ = null;
        return message;
    }

    let imagine = window.__debug_imagine.bindingEngine;
    let info = {};

    if(imagine.boundElements.has($0)) {
        info.bindings = { };

        for(let binding of imagine.boundElements.get($0).keys()) {
            console.log(binding, imagine.boundElements.get($0), imagine.boundElements.get($0).get(binding))
            info.bindings[binding] = imagine.boundElements.get($0).get(binding);
        }
    }

    return info;
}

chrome.devtools.panels.elements.createSidebarPane(
    'Imagine properties',
    function (sidebar) {
        function updateElementProperties() {
            sidebar.setExpression('(' + page_getProperties.toString() + ')()');
        }
        updateElementProperties();
        chrome.devtools.panels.elements.onSelectionChanged.addListener(
            updateElementProperties);
    });