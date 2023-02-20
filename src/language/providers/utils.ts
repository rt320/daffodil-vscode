/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as vscode from 'vscode'
import { commonCompletion } from './intellisense/commonItems'

const schemaPrefixRegEx = new RegExp('</?(|[^ ]+:)schema')

// default namespace in the event that a namespace was not found
const defaultXsdNsPrefix = 'xs'

// Function to insert snippet to active editor
export function insertSnippet(snippetString: string, backpos: vscode.Position) {
  vscode.window.activeTextEditor?.insertSnippet(
    new vscode.SnippetString(snippetString),
    backpos
  )
}

export function lineCount(
  document: vscode.TextDocument,
  position: vscode.Position,
  tag: string
) {
  let lineNum = position.line
  let lineCount = 0
  const nsPrefix = getXsdNsPrefix(document, position)

  while (lineNum !== 0) {
    --lineNum
    ++lineCount
    const triggerText = document.lineAt(lineNum).text

    if (
      triggerText.includes('<' + nsPrefix + tag) &&
      !triggerText.includes('</' + nsPrefix + tag) &&
      !triggerText.includes('/>')
    ) {
      return lineCount
    }
  }

  return lineCount
}

export function nearestOpen(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  const nsPrefix = getXsdNsPrefix(document, position)
  const items = [
    'schema',
    'element',
    'sequence',
    'choice',
    'group',
    'simpleType',
    'complexType',
    'defineVariable',
    'setVariable',
  ]

  for (let i = 0; i < items.length; ++i) {
    if (checkTagOpen(document, position, nsPrefix, items[i])) {
      return items[i]
    }
  }

  return 'none'
}

export function nearestTag(
  document: vscode.TextDocument,
  position: vscode.Position,
  nsPrefix: string,
  startLine: number,
  startPos: number
): [string, number, number] {
  const triggerLine = position.line
  let lineNum = startLine
  const triggerText = document.lineAt(triggerLine).text
  const itemsOnLine = getItemsOnLineCount(document.lineAt(lineNum).text)
  const items = [
    'element',
    'sequence',
    'choice',
    'group',
    'simpleType',
    'complexType',
    'schema',
  ]
  let tagPos = triggerText.indexOf('<')
  let endPos = triggerText.lastIndexOf('>')

  if (itemsOnLine > 1 && startPos !== tagPos && startPos < endPos) {
    let textBeforeTrigger = triggerText.substring(0, startPos)
    let prevTagPos = 0

    while (prevTagPos > -1) {
      prevTagPos = textBeforeTrigger.lastIndexOf('<')
      let tag = textBeforeTrigger.substring(prevTagPos)

      if (
        !textBeforeTrigger.includes('</') &&
        !textBeforeTrigger.includes('/>')
      ) {
        for (let i = 0; i < items.length; ++i) {
          if (tag.includes('<' + nsPrefix + items[i])) {
            return [items[i], startLine, prevTagPos]
          }
        }
      }

      textBeforeTrigger = textBeforeTrigger.substring(0, prevTagPos)
    }
  } else {
    while (lineNum > -1 && lineNum < document.lineCount - 1) {
      let currentText = document.lineAt(lineNum).text

      if (getItemsOnLineCount(currentText) < 2) {
        if (!currentText.includes('</') && !currentText.includes('/>')) {
          for (let i = 0; i < items.length; ++i) {
            if (currentText.includes('<' + nsPrefix + items[i])) {
              return [items[i], lineNum, startPos]
            }
          }
        }
      }

      --lineNum
    }
  }

  return ['none', 0, 0]
}

export function checkTagOpen(
  document: vscode.TextDocument,
  position: vscode.Position,
  nsPrefix: string,
  tag: string
) {
  const triggerLine = position.line
  const triggerPos = position.character
  const triggerText = document.lineAt(triggerLine).text
  const itemsOnLine = getItemsOnLineCount(triggerText)
  const textBeforeTrigger = triggerText.substring(0, triggerPos)
  const tagPos = textBeforeTrigger.lastIndexOf('<' + nsPrefix + tag)
  const tagEndPos = triggerText.indexOf('>', tagPos)
  const nextTagPos = triggerText.indexOf('<', tagPos + 1)

  if (tagPos > -1 && itemsOnLine > 1) {
    if (
      triggerPos > tagPos &&
      ((triggerPos <= tagEndPos &&
        (nextTagPos > tagEndPos || nextTagPos === -1)) ||
        tagEndPos === -1)
    ) {
      return true
    }
  }

  if (tagPos > -1 && itemsOnLine < 2) {
    if (triggerPos > tagPos && (triggerPos <= tagEndPos || tagEndPos === -1)) {
      return true
    }
  }

  return false
}

//returns an empty value or a prefix plus a colon
export function getXsdNsPrefix(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  let initialLineNum = position.line
  let lineNum = 0

  while (initialLineNum !== 0 && lineNum <= initialLineNum) {
    const lineText = document.lineAt(lineNum).text

    // returns either empty prefix value or a prefix plus a colon
    let text = lineText.match(schemaPrefixRegEx)
    if (text != null) {
      return text[1]
    }

    ++lineNum
  }

  //returns the standard prefix plus a colon in the case of missing schema tag
  return defaultXsdNsPrefix + ':'
}

export function getItemsOnLineCount(triggerText: String) {
  let itemsOnLine = 0
  let nextPos = 0
  let result = 0

  if (triggerText.includes('schema')) {
    itemsOnLine = 1
    return itemsOnLine
  }

  while (result != -1 && triggerText.includes('<')) {
    result = triggerText.indexOf('<', nextPos)

    if (result > -1) {
      let endPos = triggerText.indexOf('>', nextPos)

      if (endPos === -1) {
        break
      }

      let testForCloseTag = triggerText.substring(nextPos, endPos)

      if (!testForCloseTag.includes('</')) {
        ++itemsOnLine
      }

      result = nextPos
      nextPos = endPos + 1
    }
  }

  return itemsOnLine
}

export function checkBraceOpen(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  let lineNum = position.line

  while (lineNum !== 0) {
    const triggerText = document.lineAt(lineNum).text

    if (!triggerText.includes('{')) {
      return false
    } else if (
      triggerText.includes('"{') &&
      triggerText.includes('}"') &&
      (triggerText.includes('..') || triggerText.includes('.')) &&
      !triggerText.includes('}"/') &&
      !triggerText.includes('>')
    ) {
      return true
    } else if (
      triggerText.includes('"{') &&
      !triggerText.includes('}"') &&
      !triggerText.includes('}"/') &&
      !triggerText.includes('>')
    ) {
      return true
    } else if (
      triggerText.includes('}"') &&
      !triggerText.includes('}"/') &&
      !triggerText.includes('>')
    ) {
      return true
    } else if (
      triggerText
        .substring(
          triggerText.lastIndexOf('{'),
          triggerText.indexOf('}', triggerText.lastIndexOf('{'))
        )
        .includes('/')
    ) {
      return true
    } else if (
      triggerText.includes('}"') &&
      (triggerText.includes('}"/') ||
        triggerText.includes('>') ||
        triggerText.includes('/>'))
    ) {
      return false
    }

    --lineNum
  }

  return false
}

export function createCompletionItem(
  e:
    | {
        item: string
        snippetString: string
        markdownString: string
      }
    | {
        item: string
        snippetString: string
        markdownString: undefined
      },
  preVal: string,
  nsPrefix: string
) {
  const completionItem = new vscode.CompletionItem(e.item)

  const noPreVals = [
    'dfdl:choiceBranchKey=',
    'dfdl:representation',
    'dfdl:choiceDispatchKey=',
    'dfdl:simpleType',
    nsPrefix + 'restriction',
  ]

  if (preVal !== '' && !noPreVals.includes(e.item)) {
    completionItem.insertText = new vscode.SnippetString(
      preVal + e.snippetString
    )
  } else {
    completionItem.insertText = new vscode.SnippetString(e.snippetString)
  }

  if (e.markdownString) {
    completionItem.documentation = new vscode.MarkdownString(e.markdownString)
  }

  return completionItem
}

export function getCommonItems(
  itemsToUse: string[],
  preVal: string = '',
  additionalItems: string = '',
  nsPrefix: string
) {
  let compItems: vscode.CompletionItem[] = []

  commonCompletion(additionalItems, nsPrefix).items.forEach((e) => {
    if (itemsToUse.includes(e.item)) {
      const completionItem = createCompletionItem(e, preVal, nsPrefix)
      compItems.push(completionItem)
    }
  })

  return compItems
}
