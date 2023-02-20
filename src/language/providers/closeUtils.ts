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
import { getItemsOnLineCount, getXsdNsPrefix } from './utils'

export function isBetweenOpenCloseTags(
  document: vscode.TextDocument,
  position: vscode.Position,
  tag: string,
  startLine: number
) {
  const nsPrefix = getXsdNsPrefix(document, position)
  const [triggerLine, triggerPos] = [position.line, position.character]

  let lineNum = position.line
  const triggerText = document.lineAt(lineNum).text
  const textBeforeTrigger = triggerText.substring(0, triggerPos)

  let itemsOnLine = getItemsOnLineCount(document.lineAt(lineNum).text)
  let tagPos = textBeforeTrigger.lastIndexOf('<' + nsPrefix + tag)
  let tagEndPos = triggerText.indexOf('>', tagPos)
  let selfClosingTagPos = triggerText.indexOf('/>', tagPos)
  let closingTagPos = triggerText.indexOf('</' + nsPrefix + tag, tagEndPos)
  let closingTagEndPos = triggerText.indexOf('>', closingTagPos)

  if (closingTagPos === -1) {
    closingTagEndPos = -1
  }

  if (itemsOnLine > 1 && lineNum != -1 && triggerText.includes(tag)) {
    //if there are multiple tags on the line, and the trigger is
    //between the open and close tags
    if (
      (selfClosingTagPos !== -1 && triggerPos < tagEndPos) ||
      (triggerPos > tagEndPos && triggerPos <= closingTagPos) ||
      (triggerPos > tagEndPos && closingTagPos === -1)
    ) {
      return true
    }
  } else {
    let currentText = ''

    //if triggerLine equals startLine and the triggerLine
    // is selfClosing the tag is not btwn open and close tags
    if (
      triggerText.includes('/>') &&
      triggerText.includes(tag) &&
      startLine === triggerLine &&
      (triggerPos <= tagPos || triggerPos >= closingTagEndPos)
    ) {
      return true
    }

    //If the the TriggerLine is a closing tag and the closing tag
    //matches this open tag the trigger is btwn open and close tags
    if (
      triggerText.includes('</') &&
      triggerText.includes(tag) &&
      startLine < triggerLine
    ) {
      return true
    }

    //if the opening tag is before the trigger and the closing tag
    //is after the trigger, the trigger is btwn open and close tags
    //don't evaluate lines with multiple tags
    if (startLine <= triggerLine) {
      lineNum = startLine

      while (lineNum > -1 && lineNum < document.lineCount - 1) {
        ++lineNum
        currentText = document.lineAt(lineNum).text
        itemsOnLine = getItemsOnLineCount(currentText)

        if (currentText.includes('</' + nsPrefix + tag) && itemsOnLine < 2) {
          return true
        }
      }
    }
  }

  return false
}

export function checkMissingCloseTag(
  document: vscode.TextDocument,
  position: vscode.Position,
  nsPrefix: string
) {
  const triggerLine = position.line
  const triggerPos = position.character
  const triggerText = document.lineAt(triggerLine).text
  const itemsOnLine = getItemsOnLineCount(triggerText)

  const items = [
    'annotation',
    'schema',
    'element',
    'sequence',
    'choice',
    'group',
    'simpleType',
    'complexType',
    'assert',
    'discriminator',
    'defineVariable',
    'setVariable',
  ]

  for (let i = 0; i < items.length; ++i) {
    const textBeforeTrigger = triggerText.substring(0, triggerPos)

    if (itemsOnLine > 1) {
      if (textBeforeTrigger.lastIndexOf('<' + nsPrefix + items[i]) > -1) {
        let gt1res = getItemsForLineGT1(
          triggerText,
          triggerPos,
          nsPrefix,
          items,
          i
        )

        if (gt1res != undefined) {
          return gt1res
        }
      }
    }

    if (itemsOnLine < 2) {
      let lt2res = getItemsForLineLT2(
        document,
        triggerText,
        triggerLine,
        nsPrefix,
        items,
        i
      )

      if (lt2res != undefined) {
        return lt2res
      }
    }
  }

  return 'none'
}

export function getCloseTag(
  document: vscode.TextDocument,
  position: vscode.Position,
  nsPrefix: string,
  tag: string,
  startLine: number,
  startPos: number
): [string, number, number] {
  let lineNum = startLine
  let tagOpen = startPos
  const triggerText = document.lineAt(startLine).text
  const itemsOnLine = getItemsOnLineCount(document.lineAt(lineNum).text)
  let tagPos = triggerText.indexOf('<')
  let endPos = triggerText.lastIndexOf('>')

  if (itemsOnLine > 1 && startPos !== tagPos && startPos < endPos) {
    while (tagOpen > -1 && tagOpen < triggerText.length) {
      tagOpen = triggerText.indexOf('<', tagOpen)
      let tagClose = triggerText.indexOf('>', tagOpen)
      let tagPart = triggerText.substring(tagOpen, tagClose)

      if (tagPart.includes(tag) && tagPart.includes('/')) {
        return [tag, startLine, tagOpen]
      }

      tagOpen = tagClose + 1
    }
  } else {
    let endPos = triggerText.indexOf('>', startPos)

    if (
      (triggerText.includes('</') || triggerText.includes('/>')) &&
      triggerText.includes(tag) &&
      endPos > -1 &&
      itemsOnLine < 2
    ) {
      return [tag, startLine, startPos]
    }

    ++lineNum

    while (lineNum > -1 && lineNum < document.lineCount) {
      let currentText = document.lineAt(lineNum).text

      if (getItemsOnLineCount(currentText) < 2) {
        if (currentText.includes('</' + nsPrefix + tag)) {
          return [tag, lineNum, startPos]
        }
      }

      ++lineNum
    }
  }

  return ['none', 0, 0]
}

export function getItemsForLineGT1(
  triggerText: string,
  triggerPos: number,
  nsPrefix: string,
  items: string[],
  i: number
) {
  let openTagArray: number[] = []
  let closeTagArray: number[] = []
  let [nextCloseTagPos, nextCloseCharPos, nextOpenTagPos] = [0, 0, 0]

  while (
    (nextOpenTagPos = triggerText.indexOf(
      '<' + nsPrefix + items[i],
      nextOpenTagPos
    )) > -1
  ) {
    openTagArray.push(nextOpenTagPos)

    if ((nextCloseCharPos = triggerText.indexOf('>', nextOpenTagPos)) > -1) {
      //if tag is self closing remove it from the openTagArray
      if (triggerText.substring(nextCloseCharPos - 1, 2) === '/>') {
        openTagArray.splice(-1, 1)
      }

      nextOpenTagPos = nextOpenTagPos + 1
    }
  }

  while (
    (nextCloseTagPos = triggerText.indexOf(
      '</' + nsPrefix + items[i],
      nextCloseTagPos
    )) > -1
  ) {
    closeTagArray.push(nextCloseTagPos)
    nextCloseTagPos = nextCloseTagPos + 1
  }

  if (openTagArray.length > closeTagArray.length) {
    return items[i]
  }

  return undefined
}

export function getItemsForLineLT2(
  document: vscode.TextDocument,
  triggerText: string,
  triggerLine: number,
  nsPrefix: string,
  items: string[],
  i: number
) {
  let [currentText, currentLine] = [triggerText, triggerLine]
  let [lineBefore, lineAfter] = [triggerLine, triggerLine]
  let openTagArray: number[] = []
  let closeTagArray: number[] = []

  while (
    currentText.indexOf('<' + nsPrefix + items[i]) === -1 &&
    currentLine > -1
  ) {
    --currentLine

    if (currentLine > -1) {
      currentText = document.lineAt(currentLine).text
    }

    if (getItemsOnLineCount(currentText) > 1) {
      --currentLine
    }
  }

  if (currentText.indexOf('<' + nsPrefix + items[i]) > -1) {
    while (lineBefore > -1) {
      currentText = document.lineAt(lineBefore).text
      if (getItemsOnLineCount(currentText) < 2) {
        if (currentText.indexOf('<' + nsPrefix + items[i]) > -1) {
          openTagArray.push(lineBefore)

          //if selfclosing remove from the array
          if (currentText.indexOf('/>') > -1) {
            openTagArray.splice(openTagArray.length - 1, 1)
          }
        }

        if (currentText.indexOf('</' + nsPrefix + items[i]) > -1) {
          closeTagArray.push(lineBefore)
        }
      }

      --lineBefore
    }

    ++lineAfter

    while (lineAfter < document.lineCount) {
      currentText = document.lineAt(lineAfter).text

      if (getItemsOnLineCount(currentText) < 2) {
        if (currentText.indexOf('<' + nsPrefix + items[i]) > -1) {
          openTagArray.push(lineAfter)

          //if selfclosing remove from the array
          if (currentText.indexOf('/>') > -1) {
            openTagArray.splice(openTagArray.length - 1, 1)
          }
        }

        if (currentText.indexOf('</' + nsPrefix + items[i]) > -1) {
          closeTagArray.push(lineAfter)
        }
      }

      ++lineAfter
    }

    if (openTagArray.length > closeTagArray.length) {
      return items[i]
    }
  }

  return undefined
}
