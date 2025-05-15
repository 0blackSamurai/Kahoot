const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Media schema to support different media types
const mediaSchema = new Schema({
  type: { 
    type: String, 
    enum: ['image', 'video', 'audio', 'none'], 
    default: 'none' 
  },
  url: { type: String },
  alt: { type: String }
});

const textAnswerSchema = new Schema({
  correctAnswer: { type: String, required: true },
  caseSensitive: { type: Boolean, default: false },
  exactMatch: { type: Boolean, default: true },
  alternativeAnswers: [{ type: String }]
});

const questionSchema = new Schema({
  questionText: { type: String, required: true },
  questionType: { 
    type: String, 
    enum: ['multiple-choice', 'text-answer', 'true-false', 'ordering'],
    default: 'multiple-choice'
  },
  options: [{ 
    text: { type: String, required: true },
    isCorrect: { type: Boolean, default: false }
  }],
  textAnswer: textAnswerSchema,
  isTrueCorrect: { type: Boolean },
  orderItems: [{ type: String }],
  timeLimit: { type: Number, default: 30 }, // Time limit in seconds
  points: { 
    type: String, 
    enum: ['standard', 'double', 'no-points'], 
    default: 'standard' 
  },
  media: { 
    type: mediaSchema, 
    default: () => ({
      type: 'none',
      url: '',
      alt: ''
    })
  }
});

const quizSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  questions: [questionSchema],
  isPublic: { type: Boolean, default: false },
  theme: {
    type: String,
    enum: ['default', 'dark', 'colorful'],
    default: 'dark'
  },
  coverImage: { type: String },
  tags: [{ type: String }],
  playCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt field on save
quizSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Quiz', quizSchema);
