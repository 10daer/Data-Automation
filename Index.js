const CONFIG = {
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',
  SOURCE_SHEET_NAME: 'Raw Data',
  PROCESSED_SHEET_NAME: 'Processed Data',
  ERROR_LOG_SHEET_NAME: 'Error Log',
  EMAIL_NOTIFICATIONS: ['your.email@domain.com'],
  BATCH_SIZE: 50
};

class DataEntryAutomation {
  constructor() {
    this.spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    this.sourceSheet = this.spreadsheet.getSheetByName(CONFIG.SOURCE_SHEET_NAME);
    this.processedSheet = this.spreadsheet.getSheetByName(CONFIG.PROCESSED_SHEET_NAME);
    this.errorLogSheet = this.spreadsheet.getSheetByName(CONFIG.ERROR_LOG_SHEET_NAME);
    this.processedCount = 0;
    this.errorCount = 0;
    this.startTime = new Date();
  }

  processData() {
    console.log('Starting data processing...');
    try {
      const sourceData = this.getSourceData();
      if (!sourceData.length) {
        console.log('No data to process');
        return;
      }
      this.processBatches(sourceData);
      this.sendCompletionReport();
    } catch (error) {
      this.handleError(error);
    }
  }

  getSourceData() {
    const data = this.sourceSheet.getDataRange().getValues();
    const headers = data.shift();
    return data.filter(row => row.some(cell => cell !== ''))
               .map(row => this.createDataObject(headers, row));
  }

  createDataObject(headers, rowData) {
    return headers.reduce((obj, header, index) => {
      obj[header.toLowerCase().replace(/\s+/g, '_')] = rowData[index];
      return obj;
    }, {});
  }

  processBatches(data) {
    for (let i = 0; i < data.length; i += CONFIG.BATCH_SIZE) {
      const batch = data.slice(i, Math.min(i + CONFIG.BATCH_SIZE, data.length));
      this.processBatch(batch);
      if (this.isNearingTimeout()) {
        this.scheduleNextBatch(i + CONFIG.BATCH_SIZE, data.length);
        break;
      }
    }
  }

  processBatch(batch) {
    const processedData = batch.map(record => {
      try {
        return this.processRecord(record);
      } catch (error) {
        this.logError(record, error);
        this.errorCount++;
        return null;
      }
    }).filter(record => record !== null);

    if (processedData.length > 0) {
      this.writeToProcessedSheet(processedData);
      this.processedCount += processedData.length;
    }
  }

  processRecord(record) {
    this.validateRecord(record);
    return {
      timestamp: new Date(),
      name: this.formatName(record.name),
      email: record.email.toLowerCase(),
      phone: this.formatPhoneNumber(record.phone),
      address: this.formatAddress(record),
      category: this.standardizeCategory(record.category),
      status: 'Processed',
      process_date: new Date()
    };
  }

  validateRecord(record) {
    if (!record.name || !record.email) {
      throw new Error('Missing required fields');
    }
    if (!this.isValidEmail(record.email)) {
      throw new Error('Invalid email format');
    }
  }

  formatName(name) {
    return name.trim().split(' ').map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
  }

  formatPhoneNumber(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    }
    return phone;
  }

  formatAddress(record) {
    const parts = [record.street_address, record.city, record.state, record.zip_code].filter(Boolean);
    return parts.join(', ');
  }

  standardizeCategory(category) {
    const categoryMap = { 'cat a': 'Category A', 'cat b': 'Category B', 'cat c': 'Category C' };
    return categoryMap[category.toLowerCase()] || category;
  }

  writeToProcessedSheet(data) {
    const values = data.map(record => [
      record.timestamp,
      record.name,
      record.email,
      record.phone,
      record.address,
      record.category,
      record.status,
      record.process_date
    ]);
    this.processedSheet.getRange(this.processedSheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
  }

  logError(record, error) {
    this.errorLogSheet.appendRow([new Date(), JSON.stringify(record), error.message, error.stack]);
  }

  isNearingTimeout() {
    const executionTime = new Date() - this.startTime;
    return executionTime > 280000;
  }

  scheduleNextBatch(startIndex, totalLength) {
    const trigger = ScriptApp.newTrigger('resumeProcessing').timeBased().after(1000 * 60).create();
    PropertiesService.getScriptProperties().setProperties({
      'resumeIndex': startIndex.toString(),
      'totalLength': totalLength.toString(),
      'triggerId': trigger.getUniqueId()
    });
  }

  sendCompletionReport() {
    const executionTime = (new Date() - this.startTime) / 1000;
    const emailBody = `
      Data Processing Complete
      Total Records Processed: ${this.processedCount}
      Errors Encountered: ${this.errorCount}
      Execution Time: ${executionTime} seconds
      Please check the spreadsheet for processed data and error log.
    `;
    GmailApp.sendEmail(CONFIG.EMAIL_NOTIFICATIONS.join(','), 'Data Processing Complete', emailBody);
  }

  handleError(error) {
    console.error('Global error:', error);
    GmailApp.sendEmail(CONFIG.EMAIL_NOTIFICATIONS.join(','), 'Data Processing Error', `An error occurred during data processing:\n\n${error.message}\n\n${error.stack}`);
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

function startDataProcessing() {
  const automation = new DataEntryAutomation();
  automation.processData();
}

function resumeProcessing() {
  const props = PropertiesService.getScriptProperties();
  const startIndex = parseInt(props.getProperty('resumeIndex'));
  const totalLength = parseInt(props.getProperty('totalLength'));
  const triggerId = props.getProperty('triggerId');

  if (triggerId) {
    ScriptApp.getProjectTriggers().filter(trigger => trigger.getUniqueId() === triggerId).forEach(trigger => ScriptApp.deleteTrigger(trigger));
  }

  const automation = new DataEntryAutomation();
  automation.processData();
    }
