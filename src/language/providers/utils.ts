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

export function isBetweenOpenCloseTags(
  document: vscode.TextDocument,
  position: vscode.Position,
  tag: string,
  startLine: number
) {
  let lineNum = position.line
  let itemsOnLine = getItemsOnLineCount(document.lineAt(lineNum).text)
  const nsPrefix = getXsdNsPrefix(document, position)
  const triggerLine = position.line
  const triggerPos = position.character
  let triggerText = document.lineAt(lineNum).text
  const textBeforeTrigger = triggerText.substring(0, triggerPos)
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
    //matches this open tag and the trigger position is before the
    //beginnning of the close tag, the trigger is btwn open and close tags
    let currentText = ''
    closingTagPos = triggerText.indexOf('</' + nsPrefix + tag)
    closingTagEndPos = triggerText.indexOf('>', closingTagPos)
    if (closingTagPos === -1) {
      closingTagEndPos = -1
    }
    if (
      triggerText.includes('</') &&
      triggerText.includes(tag) &&
      startLine === triggerLine &&
      triggerPos <= closingTagPos
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
        //if there is another open tag for this item skip lines
        //until the close tag for this item
        if (
          currentText.includes('<' + nsPrefix + tag) &&
          currentText.includes('>') &&
          !currentText.includes('/>')
        ) {
          //skipping to closing tag
          while (
            !currentText.includes('</' + nsPrefix + tag) &&
            getItemsOnLineCount(currentText) < 2
          ) {
            currentText = document.lineAt(++lineNum).text
          }
          //skip to the next line
          currentText = document.lineAt(++lineNum).text
        }
        if (currentText.includes('</' + nsPrefix + tag) && itemsOnLine < 2) {
          closingTagPos = currentText.indexOf('</')
          if (
            lineNum > triggerLine ||
            (lineNum === triggerLine && triggerPos < closingTagPos)
          ) {
            return true
          }
          return false
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
    'element',
    'choice',
    'sequence',
    'group',
    'simpleType',
    'complexType',
    'annotation',
    'appinfo',
    'assert',
    'discriminator',
    'defineVariable',
    'setVariable',
    'schema',
  ]
  //let test = ''
  let currentLine = triggerLine
  let currentText = triggerText
  let lineBefore = triggerLine
  let lineAfter = triggerLine
  let openTagArray: number[] = []
  let closeTagArray: number[] = []
  let nextCloseTagPos = 0
  for (let i = 0; i < items.length; ++i) {
    const textBeforeTrigger = triggerText.substring(0, triggerPos)
    if (itemsOnLine > 1) {
      if (
        items[i] === 'assert' ||
        items[i] === 'discriminator' ||
        items[i] === 'Variable'
      ) {
        nsPrefix = 'dfdl:'
      }
      if (textBeforeTrigger.lastIndexOf('<' + nsPrefix + items[i]) > -1) {
        let nextCloseCharPos = 0
        let nextOpenTagPos = 0
        while (
          (nextOpenTagPos = triggerText.indexOf(
            '<' + nsPrefix + items[i],
            nextOpenTagPos
          )) > -1
        ) {
          openTagArray.push(nextOpenTagPos)
          nextCloseCharPos = triggerText.indexOf('>', nextOpenTagPos)
          //if the current tag doesn't have a closing symbol '>'
          if (triggerText.indexOf('<', nextOpenTagPos + 1) < nextCloseCharPos) {
            nextCloseCharPos = triggerText.indexOf('<', nextOpenTagPos + 1) - 1
          }
          //if tag is self closing remove it from the openTagArray
          if (triggerText.substring(nextCloseCharPos - 1, 2) === '/>') {
            openTagArray.splice(-1, 1)
          }
          nextOpenTagPos = nextOpenTagPos + 1
        }
        let testval = triggerText.indexOf(
          '</' + nsPrefix + items[i],
          nextCloseCharPos
        )
        while (
          //(nextCloseTagPos = triggerText.indexOf(
          //  '</' + nsPrefix + items[i],
          //  nextCloseTagPos
          //)) !== -1
          testval !== -1
        ) {
          closeTagArray.push(nextCloseTagPos)
          nextCloseTagPos = nextCloseTagPos + 1
          testval = triggerText.indexOf(
            '</' + nsPrefix + items[i],
            nextCloseTagPos
          )
        }
        if (openTagArray.length > closeTagArray.length) {
          return items[i]
        }
      }
    }
    currentText = triggerText
    currentLine = triggerLine
    lineBefore = triggerLine
    lineAfter = triggerLine
    openTagArray = []
    closeTagArray = []
    if (itemsOnLine < 2) {
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
    }
  }
  return 'none'
}

export function nearestOpen(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  const nsPrefix = getXsdNsPrefix(document, position)
  const items = [
    'element',
    'sequence',
    'choice',
    'group',
    'simpleType',
    'complexType',
    'defineVariable',
    'setVariable',
    'schema',
  ]
  for (let i = 0; i < items.length; ++i) {
    if (checkTagOpen(document, position, nsPrefix, items[i])) {
      return items[i]
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
  let triggerLine = position.line
  let triggerPos = position.character
  let lineNum = startLine
  let tagOpen = startPos
  const triggerText = document.lineAt(position.line).text
  const itemsOnLine = getItemsOnLineCount(document.lineAt(lineNum).text)
  //let tagPos = triggerText.indexOf('<')
  let endPos = triggerText.lastIndexOf('>')
  if (
    itemsOnLine > 1 &&
    //startPos !== tagPos &&
    startPos < endPos
  ) {
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
      return [tag, triggerLine, triggerPos]
    }
    while (lineNum > -1 && lineNum < document.lineCount) {
      let currentText = document.lineAt(lineNum).text
      if (getItemsOnLineCount(currentText) < 2) {
        startPos = currentText.indexOf('<')
        if (
          currentText.includes('<' + nsPrefix + tag) &&
          currentText.includes('/>')
        ) {
          return [tag, lineNum, startPos]
        }
        //if there is another open tag for this item skip lines
        //until the close tag for this item
        if (
          currentText.includes('<' + nsPrefix + tag) &&
          currentText.includes('>') &&
          !currentText.includes('/>')
        ) {
          //skipping to closing tag
          while (!currentText.includes('</' + nsPrefix + tag)) {
            currentText = document.lineAt(++lineNum).text
            //if multiple tags on this line skip to the next line
            if (getItemsOnLineCount(currentText)) {
              currentText = document.lineAt(++lineNum).text
            }
          }
        }
        if (currentText.includes('</' + nsPrefix + tag)) {
          return [tag, lineNum, startPos]
        }
      }
      ++lineNum
    }
  }
  return ['none', 0, 0]
}

export function nearestTag(
  document: vscode.TextDocument,
  position: vscode.Position,
  nsPrefix: string,
  startLine: number,
  startPos: number
): [string, number, number] {
  const TriggerLine = position.line
  let lineNum = startLine
  const triggerText = document.lineAt(TriggerLine).text
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
        ++itemsOnLine
        break
      }
      let testForCloseTag = triggerText.substring(nextPos, endPos)
      if (
        !testForCloseTag.includes('</') &&
        !testForCloseTag.includes('<!--') &&
        !testForCloseTag.includes('-->')
      ) {
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
    //.text.substring(0, document.lineAt(lineNum).range.end.character)

    if (!triggerText.includes('{')) {
      return false
    }
    if (
      triggerText.includes('"{') &&
      triggerText.includes('}"') &&
      (triggerText.includes('..') || triggerText.includes('.')) &&
      !triggerText.includes('}"/') &&
      !triggerText.includes('>')
    ) {
      return true
    }
    if (
      triggerText.includes('"{') &&
      !triggerText.includes('}"') &&
      !triggerText.includes('}"/') &&
      !triggerText.includes('>')
    ) {
      return true
    }
    if (
      triggerText.includes('}"') &&
      !triggerText.includes('}"/') &&
      !triggerText.includes('>')
    ) {
      return true
    }
    /*if (triggerText.includes('{')) {
      let continuationTest = triggerText.substring(triggerText.lastIndexOf('{'),
                 triggerText.indexOf('}'))
      if(continuationTest.endsWith('/') ) {
        return true
      }
    }*/
    if (
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
